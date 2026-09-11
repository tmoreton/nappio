import {
  mediaDevices,
  type MediaStream,
  type MediaStreamTrack,
  RTCPeerConnection,
  RTCView,
} from 'react-native-webrtc';
import * as Battery from 'expo-battery';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/design';
import type {
  RealtimeIceCandidate,
  RealtimeServerMessage,
  RealtimeSessionDescription,
} from '@/realtime/protocol';
import { RealtimeSignalingConnection } from '@/realtime/signaling';
import type { BabyDeviceStatus } from '@/monitoring/baby-device-status';
import type { IceServer } from '@/pairing/types';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

const DEVICE_STATUS_INTERVAL_MS = 15_000;
const VIDEO_MAX_BITRATE = 1_000_000;
const VIDEO_MAX_FRAMERATE = 15;

type BabyRoomProps = {
  session: MonitorSession;
  onStatusChange: (status: MonitorStatus) => void;
  onSessionRenewed: (sessionExpiresAt: string) => void;
  onParentCountChange: (count: number) => void;
  onError: (message: string) => void;
};

type ParentPeer = {
  channel: ReturnType<RTCPeerConnection['createDataChannel']>;
  connectionId: string;
  pc: RTCPeerConnection;
  pendingCandidates: RealtimeIceCandidate[];
  videoSender: ReturnType<RTCPeerConnection['addTrack']> | null;
};

export function BabyRoom({
  session,
  onStatusChange,
  onSessionRenewed,
  onParentCountChange,
  onError,
}: BabyRoomProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const { recoveryToken, role, roomId } = session;

  useEffect(() => {
    let disposed = false;
    let media: MediaStream | null = null;
    let signaling: RealtimeSignalingConnection | null = null;
    let iceServers: IceServer[] = [];
    let latestDeviceStatus: BabyDeviceStatus | null = null;
    const peers = new Map<string, ParentPeer>();

    function updateParentCount() {
      onParentCountChange(
        [...peers.values()].filter(({ pc }) => pc.connectionState === 'connected').length,
      );
    }

    function closePeer(peerId: string) {
      const peer = peers.get(peerId);
      if (!peer) return;
      peers.delete(peerId);
      peer.channel.close();
      peer.pc.close();
      updateParentCount();
    }

    function closeAllPeers() {
      for (const peerId of [...peers.keys()]) closePeer(peerId);
    }

    async function setPeerVideoEnabled(peer: ParentPeer, enabled: boolean) {
      const sender = peer.videoSender;
      if (!sender) return;
      try {
        const parameters = sender.getParameters();
        if (parameters.encodings.length === 0) {
          parameters.encodings = [
            {
              active: enabled,
              maxBitrate: VIDEO_MAX_BITRATE,
              maxFramerate: VIDEO_MAX_FRAMERATE,
            },
          ];
        } else {
          for (const encoding of parameters.encodings) {
            encoding.active = enabled;
            encoding.maxBitrate = VIDEO_MAX_BITRATE;
            encoding.maxFramerate = VIDEO_MAX_FRAMERATE;
          }
        }
        parameters.degradationPreference = 'maintain-resolution';
        await sender.setParameters(parameters);
      } catch (error) {
        console.warn('Could not update direct video quality.', error);
      }
    }

    function publishDeviceStatus(status: BabyDeviceStatus) {
      latestDeviceStatus = status;
      const message = JSON.stringify({ type: 'baby-device-status', status });
      for (const { channel } of peers.values()) {
        if (channel.readyState === 'open') channel.send(message);
      }
    }

    function configureControlChannel(peer: ParentPeer) {
      peer.channel.onopen = () => {
        if (latestDeviceStatus) {
          peer.channel.send(
            JSON.stringify({ type: 'baby-device-status', status: latestDeviceStatus }),
          );
        }
      };
      peer.channel.onmessage = (event: unknown) => {
        const data = (event as unknown as { data?: unknown }).data;
        if (typeof data !== 'string') return;
        try {
          const message = JSON.parse(data) as { type?: string; enabled?: unknown };
          if (message.type === 'video-enabled' && typeof message.enabled === 'boolean') {
            void setPeerVideoEnabled(peer, message.enabled);
          }
        } catch {
          // Ignore malformed peer data rather than letting it affect monitoring.
        }
      };
    }

    async function sendDescription(
      peerId: string,
      peer: ParentPeer,
      description: RealtimeSessionDescription,
    ) {
      signaling?.send({
        type: 'signal',
        targetPeerId: peerId,
        connectionId: peer.connectionId,
        description,
      });
    }

    async function flushCandidates(peer: ParentPeer) {
      if (!peer.pc.remoteDescription) return;
      const candidates = peer.pendingCandidates.splice(0);
      for (const candidate of candidates) await peer.pc.addIceCandidate(candidate);
    }

    async function createParentPeer(peerId: string) {
      if (!media || disposed) return;
      closePeer(peerId);
      const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
      const connectionId = Crypto.randomUUID();
      const channel = pc.createDataChannel('nappio-control', { ordered: true });
      const peer: ParentPeer = {
        channel,
        connectionId,
        pc,
        pendingCandidates: [],
        videoSender: null,
      };
      peers.set(peerId, peer);
      configureControlChannel(peer);

      for (const track of media.getTracks()) {
        const sender = pc.addTrack(track, media);
        if (track.kind === 'video') peer.videoSender = sender;
      }
      pc.onicecandidate = (event: unknown) => {
        const candidate = (event as unknown as { candidate?: { toJSON(): RealtimeIceCandidate } })
          .candidate;
        if (!candidate) return;
        const serialized = candidate.toJSON();
        signaling?.send({
          type: 'signal',
          targetPeerId: peerId,
          connectionId,
          candidate: {
            candidate: serialized.candidate,
            sdpMid: serialized.sdpMid ?? null,
            sdpMLineIndex: serialized.sdpMLineIndex ?? null,
          },
        });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeer(peerId);
          return;
        }
        updateParentCount();
      };
      pc.ontrack = (event: unknown) => {
        const track = (event as unknown as { track?: MediaStreamTrack }).track;
        if (track?.kind === 'audio') track._setVolume(1);
      };

      try {
        const offer = await pc.createOffer();
        if (typeof offer.sdp !== 'string') throw new Error('The video offer was incomplete.');
        await pc.setLocalDescription(offer);
        await setPeerVideoEnabled(peer, true);
        await sendDescription(peerId, peer, { type: 'offer', sdp: offer.sdp });
      } catch (error) {
        closePeer(peerId);
        if (!disposed) {
          onError(error instanceof Error ? error.message : 'Could not connect a Parent Unit.');
        }
      }
    }

    async function handleSignal(message: Extract<RealtimeServerMessage, { type: 'signal' }>) {
      const peer = peers.get(message.fromPeerId);
      if (!peer || peer.connectionId !== message.connectionId) return;
      try {
        if (message.candidate) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(message.candidate);
          else peer.pendingCandidates.push(message.candidate);
          return;
        }
        if (message.description?.type === 'answer') {
          await peer.pc.setRemoteDescription(message.description);
          await flushCandidates(peer);
          return;
        }
        if (message.description?.type === 'offer') {
          await peer.pc.setRemoteDescription(message.description);
          await flushCandidates(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await sendDescription(message.fromPeerId, peer, { type: 'answer', sdp: answer.sdp });
        }
      } catch (error) {
        closePeer(message.fromPeerId);
        if (!disposed) {
          onError(error instanceof Error ? error.message : 'The direct connection failed.');
        }
      }
    }

    async function start() {
      try {
        media = await mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: VIDEO_MAX_FRAMERATE, max: VIDEO_MAX_FRAMERATE },
          },
        });
        if (disposed) {
          media.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          return;
        }
        setLocalStream(media);
        signaling = new RealtimeSignalingConnection({ recoveryToken, role, roomId }, {
          onReady: (details) => {
            iceServers = details.iceServers;
            for (const peer of details.peers) {
              if (peer.role === 'parent') void createParentPeer(peer.peerId);
            }
          },
          onSessionRenewed,
          onMessage: (message) => {
            if (message.type === 'peer-joined' && message.peer.role === 'parent') {
              void createParentPeer(message.peer.peerId);
            } else if (message.type === 'peer-left' && message.peer.role === 'parent') {
              closePeer(message.peer.peerId);
            } else if (message.type === 'signal') {
              void handleSignal(message);
            } else if (message.type === 'peer-unavailable') {
              closePeer(message.peerId);
            } else if (message.type === 'error') {
              onError(message.error);
            }
          },
          onReset: closeAllPeers,
          onStatusChange,
          onError,
        });
        signaling.start();
      } catch (error) {
        if (!disposed) {
          onStatusChange('failed');
          onError(error instanceof Error ? error.message : 'Could not start the camera and microphone.');
        }
      }
    }

    async function updateDeviceStatus() {
      try {
        const power = await Battery.getPowerStateAsync();
        if (disposed) return;
        const chargingStates = [
          Battery.BatteryState.CHARGING,
          Battery.BatteryState.FULL,
          Battery.BatteryState.NOT_CHARGING,
        ];
        publishDeviceStatus({
          batteryLevel: power.batteryLevel >= 0 ? power.batteryLevel : null,
          isCharging:
            power.batteryState === Battery.BatteryState.UNKNOWN
              ? null
              : chargingStates.includes(power.batteryState),
          lowPowerMode: power.lowPowerMode,
        });
      } catch (error) {
        console.warn('Could not share Baby Unit power status.', error);
      }
    }

    void start();
    void updateDeviceStatus();
    const statusInterval = setInterval(() => void updateDeviceStatus(), DEVICE_STATUS_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(statusInterval);
      signaling?.stop();
      closeAllPeers();
      media?.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    };
  }, [
    onError,
    onParentCountChange,
    onSessionRenewed,
    onStatusChange,
    recoveryToken,
    role,
    roomId,
  ]);

  if (!localStream) return <CameraPlaceholder label="Starting camera and microphone…" />;
  return (
    <RTCView
      mirror={false}
      objectFit="cover"
      streamURL={localStream.toURL()}
      style={styles.video}
    />
  );
}

function CameraPlaceholder({ label }: { label: string }) {
  return (
    <View style={styles.placeholder}>
      <View style={styles.cameraGlyph} />
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
    gap: 14,
    justifyContent: 'center',
  },
  placeholderText: { color: palette.white, fontSize: 15, fontWeight: '700' },
  cameraGlyph: {
    borderColor: palette.sage,
    borderRadius: 22,
    borderWidth: 4,
    height: 44,
    width: 44,
  },
});
