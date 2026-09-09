import {
  mediaDevices,
  MediaStream,
  type MediaStreamTrack,
  RTCPeerConnection,
  RTCView,
  startIOSPIP,
} from '@livekit/react-native-webrtc';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/design';
import { startMonitoringAudioSession, stopMonitoringAudioSession } from '@/livekit/audio-session';
import {
  parseBabyDeviceStatusValue,
  type BabyDeviceStatus,
} from '@/monitoring/baby-device-status';
import {
  advanceSoundAlertDetector,
  createSoundAlertDetectorState,
  soundAlertConfigForSensitivity,
  type SoundAlertSensitivity,
} from '@/monitoring/sound-alert-detector';
import {
  audioLevelFromStats,
  connectionErrorMessage,
  iceTransportFromStats,
  iterableStats,
} from '@/realtime/peer-utils';
import type {
  RealtimeIceCandidate,
  RealtimeServerMessage,
  RealtimeSessionDescription,
} from '@/realtime/protocol';
import { RealtimeSignalingConnection } from '@/realtime/signaling';
import type { IceServer } from '@/pairing/types';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

const AUDIO_LEVEL_INTERVAL_MS = 500;
const DISCONNECTED_GRACE_MS = 3_000;
const AUDIO_METER_WEIGHTS = [0.35, 0.55, 0.8, 0.48, 1, 0.65, 0.4, 0.72, 0.5, 0.3];

type RTCDataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;

type ParentRoomProps = {
  session: MonitorSession;
  audioOnly: boolean;
  pipRequest: number;
  talking: boolean;
  soundSensitivity: SoundAlertSensitivity;
  onStatusChange: (status: MonitorStatus) => void;
  onSessionRenewed: (sessionExpiresAt: string) => void;
  onBabyConnectedChange: (connected: boolean) => void;
  onBabyDeviceStatusChange: (status: BabyDeviceStatus) => void;
  onSoundDetected: () => void;
  onTalkError: (message: string) => void;
  onError: (message: string) => void;
};

export function ParentRoom({
  session,
  audioOnly,
  pipRequest,
  talking,
  soundSensitivity,
  onStatusChange,
  onSessionRenewed,
  onBabyConnectedChange,
  onBabyDeviceStatusChange,
  onSoundDetected,
  onTalkError,
  onError,
}: ParentRoomProps) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [volume, setVolume] = useState(0);
  const { recoveryToken, role, roomId } = session;
  const videoRef = useRef<ComponentRef<typeof RTCView>>(null);
  const audioOnlyRef = useRef(audioOnly);
  const talkingRef = useRef(talking);
  const sensitivityRef = useRef(soundSensitivity);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlRef = useRef<RTCDataChannel | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const ensureTalkTrackRef = useRef<(() => Promise<void>) | null>(null);
  const releaseTalkTrackRef = useRef<(() => void) | null>(null);
  const onBabyDeviceStatusChangeRef = useRef(onBabyDeviceStatusChange);
  const onSoundDetectedRef = useRef(onSoundDetected);
  const soundAlertStateRef = useRef(createSoundAlertDetectorState());

  useEffect(() => {
    onBabyDeviceStatusChangeRef.current = onBabyDeviceStatusChange;
  }, [onBabyDeviceStatusChange]);

  useEffect(() => {
    onSoundDetectedRef.current = onSoundDetected;
  }, [onSoundDetected]);

  useEffect(() => {
    let disposed = false;
    let signaling: RealtimeSignalingConnection | null = null;
    let iceServers: IceServer[] = [];
    let babyPeerId: string | null = null;
    let connectionId: string | null = null;
    let micRequest: Promise<void> | null = null;
    let disconnectedTimer: ReturnType<typeof setTimeout> | null = null;
    let connectionReportTimer: ReturnType<typeof setTimeout> | null = null;
    let previousEnergySample: { totalAudioEnergy: number; totalSamplesDuration: number } | null = null;
    let statsRunning = false;
    const queuedCandidates = new Map<string, RealtimeIceCandidate[]>();

    function updateRemoteStream(stream: MediaStream | null) {
      remoteStreamRef.current = stream;
      if (!disposed) setRemoteStream(stream);
    }

    function sendVideoPreference() {
      const channel = controlRef.current;
      if (channel?.readyState === 'open') {
        channel.send(JSON.stringify({ type: 'video-enabled', enabled: !audioOnlyRef.current }));
      }
    }

    function configureControlChannel(channel: RTCDataChannel) {
      controlRef.current = channel;
      channel.onopen = sendVideoPreference;
      channel.onmessage = (event) => {
        const data = (event as unknown as { data?: unknown }).data;
        if (typeof data !== 'string') return;
        try {
          const message = JSON.parse(data) as { type?: unknown; status?: unknown };
          if (message.type !== 'baby-device-status') return;
          const status = parseBabyDeviceStatusValue(message.status);
          if (status) onBabyDeviceStatusChangeRef.current(status);
        } catch {
          // Ignore malformed peer data rather than letting it interrupt monitoring.
        }
      };
      channel.onclose = () => {
        if (controlRef.current === channel) controlRef.current = null;
      };
    }

    function releaseTalkTrack() {
      const stream = micStreamRef.current;
      micStreamRef.current = null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      const audioTransceiver = pcRef.current
        ?.getTransceivers()
        .find(({ receiver, sender }) =>
          receiver.track?.kind === 'audio' || sender.track?.kind === 'audio',
        );
      if (audioTransceiver?.sender.track) void audioTransceiver.sender.replaceTrack(null);
    }
    releaseTalkTrackRef.current = releaseTalkTrack;

    async function ensureTalkTrack() {
      if (micStreamRef.current || micRequest) return micRequest ?? undefined;
      micRequest = (async () => {
        try {
          const stream = await mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          if (disposed || !talkingRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          const track = stream.getAudioTracks()[0];
          if (!track) {
            stream.getTracks().forEach((candidate) => candidate.stop());
            throw new Error('Nappio could not find an available microphone.');
          }
          track.enabled = true;
          micStreamRef.current = stream;
          const audioTransceiver = pcRef.current
            ?.getTransceivers()
            .find(({ receiver, sender }) =>
              receiver.track?.kind === 'audio' || sender.track?.kind === 'audio',
            );
          if (!audioTransceiver) {
            releaseTalkTrack();
            throw new Error('The Baby Unit audio connection is not ready yet.');
          }
          await audioTransceiver.sender.replaceTrack(track);
        } catch (error) {
          if (!disposed && talkingRef.current) {
            onTalkError(error instanceof Error ? error.message : 'The microphone could not start.');
          }
        } finally {
          micRequest = null;
        }
      })();
      await micRequest;
    }
    ensureTalkTrackRef.current = ensureTalkTrack;

    function closePeer() {
      if (disconnectedTimer) clearTimeout(disconnectedTimer);
      disconnectedTimer = null;
      if (connectionReportTimer) clearTimeout(connectionReportTimer);
      connectionReportTimer = null;
      const pc = pcRef.current;
      pcRef.current = null;
      connectionId = null;
      const channel = controlRef.current;
      controlRef.current = null;
      channel?.close();
      pc?.close();
      remoteAudioTrackRef.current = null;
      previousEnergySample = null;
      soundAlertStateRef.current = createSoundAlertDetectorState();
      const stream = remoteStreamRef.current;
      updateRemoteStream(null);
      stream?.release(false);
      if (!disposed) {
        setVolume(0);
        onBabyConnectedChange(false);
      }
    }

    function restartPeer(message: string) {
      if (disposed) return;
      closePeer();
      onStatusChange('reconnecting');
      onError(message);
      signaling?.restart();
    }

    async function sendDescription(
      targetPeerId: string,
      targetConnectionId: string,
      description: RealtimeSessionDescription,
    ) {
      signaling?.send({
        type: 'signal',
        targetPeerId,
        connectionId: targetConnectionId,
        description,
      });
    }

    async function flushCandidates(pc: RTCPeerConnection, candidateKey: string) {
      const candidates = queuedCandidates.get(candidateKey) ?? [];
      queuedCandidates.delete(candidateKey);
      for (const candidate of candidates) await pc.addIceCandidate(candidate);
    }

    async function acceptOffer(
      fromPeerId: string,
      nextConnectionId: string,
      description: RealtimeSessionDescription,
    ) {
      closePeer();
      babyPeerId = fromPeerId;
      connectionId = nextConnectionId;
      const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
      let connectionReported = false;
      let connectionReportAttempts = 0;
      pcRef.current = pc;

      function reportConnectionTransport() {
        if (
          disposed ||
          pcRef.current !== pc ||
          connectionReported ||
          connectionReportAttempts >= 10
        ) return;
        connectionReportAttempts += 1;
        void pc
          .getStats()
          .then((stats: unknown) => {
            if (disposed || pcRef.current !== pc || connectionReported) return;
            const transport = iceTransportFromStats(iterableStats(stats));
            if (transport && signaling?.send({ type: 'connection-report', transport })) {
              connectionReported = true;
              return;
            }
            connectionReportTimer = setTimeout(reportConnectionTransport, 1_000);
          })
          .catch((error: unknown) => {
            console.warn('Could not identify the WebRTC connection path.', error);
            if (!disposed && pcRef.current === pc) {
              connectionReportTimer = setTimeout(reportConnectionTransport, 1_000);
            }
          });
      }

      pc.onicecandidate = (event) => {
        const candidate = (event as unknown as { candidate?: { toJSON(): RealtimeIceCandidate } })
          .candidate;
        if (!candidate || pcRef.current !== pc || !babyPeerId || !connectionId) return;
        const serialized = candidate.toJSON();
        signaling?.send({
          type: 'signal',
          targetPeerId: babyPeerId,
          connectionId,
          candidate: {
            candidate: serialized.candidate,
            sdpMid: serialized.sdpMid ?? null,
            sdpMLineIndex: serialized.sdpMLineIndex ?? null,
          },
        });
      };
      pc.ondatachannel = (event) => {
        const channel = (event as unknown as { channel?: RTCDataChannel }).channel;
        if (channel?.label === 'nappio-control') configureControlChannel(channel);
      };
      pc.ontrack = (event) => {
        const { streams, track } = event as unknown as {
          streams?: MediaStream[];
          track?: MediaStreamTrack;
        };
        if (!track || pcRef.current !== pc) return;
        if (track.kind === 'audio') {
          remoteAudioTrackRef.current = track;
          track._setVolume(1);
        }
        const suppliedStream = streams?.[0];
        if (suppliedStream) {
          const current = remoteStreamRef.current;
          updateRemoteStream(new MediaStream(suppliedStream));
          current?.release(false);
        } else {
          const current = remoteStreamRef.current;
          if (!current) updateRemoteStream(new MediaStream([track]));
          else if (!current.getTrackById(track.id)) {
            current.addTrack(track);
            updateRemoteStream(new MediaStream(current));
            current.release(false);
          }
        }
      };
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc || disposed) return;
        if (pc.connectionState === 'connected') {
          if (disconnectedTimer) clearTimeout(disconnectedTimer);
          disconnectedTimer = null;
          onBabyConnectedChange(true);
          onStatusChange('connected');
          reportConnectionTransport();
          return;
        }
        if (pc.connectionState === 'failed') {
          restartPeer(connectionErrorMessage('failed'));
          return;
        }
        if (pc.connectionState === 'disconnected') {
          onBabyConnectedChange(false);
          onStatusChange('reconnecting');
          if (disconnectedTimer) clearTimeout(disconnectedTimer);
          disconnectedTimer = setTimeout(() => {
            if (pcRef.current === pc && pc.connectionState === 'disconnected') {
              restartPeer(connectionErrorMessage('disconnected'));
            }
          }, DISCONNECTED_GRACE_MS);
        }
      };

      try {
        await pc.setRemoteDescription(description);
        if (pcRef.current !== pc) return;
        const audioTransceiver = pc
          .getTransceivers()
          .find(({ receiver }) => receiver.track?.kind === 'audio');
        if (audioTransceiver) {
          audioTransceiver.direction = 'sendrecv';
          const micTrack = micStreamRef.current?.getAudioTracks()[0];
          if (micTrack) await audioTransceiver.sender.replaceTrack(micTrack);
        }
        await flushCandidates(pc, `${fromPeerId}:${nextConnectionId}`);
        const answer = await pc.createAnswer();
        if (typeof answer.sdp !== 'string') throw new Error('The video answer was incomplete.');
        await pc.setLocalDescription(answer);
        await sendDescription(fromPeerId, nextConnectionId, {
          type: 'answer',
          sdp: answer.sdp,
        });
      } catch (error) {
        if (pcRef.current === pc) {
          restartPeer(error instanceof Error ? error.message : 'The direct connection failed.');
        }
      }
    }

    async function handleSignal(message: Extract<RealtimeServerMessage, { type: 'signal' }>) {
      if (message.description?.type === 'offer') {
        await acceptOffer(message.fromPeerId, message.connectionId, message.description);
        return;
      }
      if (!message.candidate) return;
      const candidateKey = `${message.fromPeerId}:${message.connectionId}`;
      const pc = pcRef.current;
      if (
        pc &&
        babyPeerId === message.fromPeerId &&
        connectionId === message.connectionId &&
        pc.remoteDescription
      ) {
        await pc.addIceCandidate(message.candidate);
      } else {
        const candidates = queuedCandidates.get(candidateKey) ?? [];
        candidates.push(message.candidate);
        queuedCandidates.set(candidateKey, candidates);
      }
    }

    async function start() {
      try {
        await startMonitoringAudioSession('parent');
        if (disposed) return;
        signaling = new RealtimeSignalingConnection({ recoveryToken, role, roomId }, {
          onReady: (details) => {
            iceServers = details.iceServers;
            babyPeerId = details.peers.find(({ role }) => role === 'baby')?.peerId ?? null;
          },
          onSessionRenewed,
          onMessage: (message) => {
            if (message.type === 'peer-joined' && message.peer.role === 'baby') {
              babyPeerId = message.peer.peerId;
            } else if (message.type === 'peer-left' && message.peer.peerId === babyPeerId) {
              babyPeerId = null;
              closePeer();
            } else if (message.type === 'signal') {
              void handleSignal(message).catch((error: unknown) => {
                restartPeer(
                  error instanceof Error ? error.message : 'The direct connection failed.',
                );
              });
            } else if (message.type === 'peer-unavailable' && message.peerId === babyPeerId) {
              babyPeerId = null;
              closePeer();
            } else if (message.type === 'error') {
              onError(message.error);
            }
          },
          onReset: closePeer,
          onStatusChange: (status) => {
            if (!disposed) onStatusChange(status);
          },
          onError: (message) => {
            if (!disposed) onError(message);
          },
        });
        signaling.start();
      } catch (error) {
        if (!disposed) {
          onStatusChange('failed');
          onError(error instanceof Error ? error.message : 'Could not start audio playback.');
        }
      }
    }

    const statsInterval = setInterval(() => {
      const pc = pcRef.current;
      const audioTrack = remoteAudioTrackRef.current;
      if (!pc || !audioTrack || statsRunning) return;
      statsRunning = true;
      void pc
        .getStats(audioTrack)
        .then((stats: unknown) => {
          if (disposed || pcRef.current !== pc) return;
          const result = audioLevelFromStats(iterableStats(stats), previousEnergySample);
          previousEnergySample = result.sample;
          setVolume((current) => (Math.abs(current - result.level) >= 0.01 ? result.level : current));
          const detection = advanceSoundAlertDetector(
            soundAlertStateRef.current,
            result.level,
            Date.now(),
            soundAlertConfigForSensitivity(sensitivityRef.current),
          );
          soundAlertStateRef.current = detection.state;
          if (detection.shouldNotify) onSoundDetectedRef.current();
        })
        .catch((error: unknown) => console.warn('Could not sample Baby Unit audio.', error))
        .finally(() => {
          statsRunning = false;
        });
    }, AUDIO_LEVEL_INTERVAL_MS);

    void start();
    return () => {
      disposed = true;
      clearInterval(statsInterval);
      if (disconnectedTimer) clearTimeout(disconnectedTimer);
      ensureTalkTrackRef.current = null;
      releaseTalkTrackRef.current = null;
      signaling?.stop();
      closePeer();
      releaseTalkTrack();
      void stopMonitoringAudioSession();
    };
  }, [
    onBabyConnectedChange,
    onError,
    onSessionRenewed,
    onStatusChange,
    onTalkError,
    recoveryToken,
    role,
    roomId,
  ]);

  useEffect(() => {
    audioOnlyRef.current = audioOnly;
    const channel = controlRef.current;
    if (channel?.readyState === 'open') {
      channel.send(JSON.stringify({ type: 'video-enabled', enabled: !audioOnly }));
    }
  }, [audioOnly]);

  useEffect(() => {
    sensitivityRef.current = soundSensitivity;
    soundAlertStateRef.current = createSoundAlertDetectorState();
  }, [soundSensitivity]);

  useEffect(() => {
    talkingRef.current = talking;
    if (talking) void ensureTalkTrackRef.current?.();
    else releaseTalkTrackRef.current?.();
  }, [talking]);

  useEffect(() => {
    if (Platform.OS === 'ios' && pipRequest > 0 && remoteStream && !audioOnly) {
      startIOSPIP(videoRef);
    }
  }, [audioOnly, pipRequest, remoteStream]);

  if (audioOnly) {
    return <AudioOnlyView volume={volume} connected={Boolean(remoteStream?.getAudioTracks().length)} />;
  }
  if (!remoteStream?.getVideoTracks().length) {
    return <MonitorPlaceholder label="Waiting for the baby camera…" />;
  }
  return (
    <RTCView
      ref={videoRef}
      iosPIP={{
        enabled: true,
        preferredSize: { width: 9, height: 16 },
        startAutomatically: false,
        stopAutomatically: true,
      }}
      objectFit="cover"
      streamURL={remoteStream.toURL()}
      style={styles.video}
    />
  );
}

function AudioOnlyView({ volume, connected }: { volume: number; connected: boolean }) {
  return (
    <View style={styles.audioOnly}>
      <View style={styles.audioOrb}>
        <Text style={styles.audioIcon}>♪</Text>
      </View>
      <Text style={styles.audioTitle}>Listening in audio only</Text>
      <View style={styles.meter} accessibilityLabel="Live audio level">
        {AUDIO_METER_WEIGHTS.map((weight, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              { height: 8 + Math.max(0.08, volume) * weight * 68, opacity: connected ? 1 : 0.25 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function MonitorPlaceholder({ label }: { label: string }) {
  return (
    <View style={styles.placeholder}>
      <View style={styles.pulse} />
      <Text style={styles.placeholderText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  video: { height: '100%', width: '100%' },
  placeholder: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  pulse: {
    backgroundColor: palette.peach,
    borderRadius: 13,
    height: 26,
    opacity: 0.8,
    width: 26,
  },
  placeholderText: { color: palette.white, fontSize: 15, fontWeight: '700' },
  audioOnly: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  audioOrb: {
    alignItems: 'center',
    backgroundColor: palette.sageWash,
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 96,
  },
  audioIcon: { color: palette.sageDark, fontSize: 38, fontWeight: '800' },
  audioTitle: { color: palette.white, fontSize: 22, fontWeight: '800' },
  meter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    height: 84,
    marginTop: spacing.lg,
  },
  bar: { backgroundColor: palette.peach, borderRadius: 4, width: 7 },
});
