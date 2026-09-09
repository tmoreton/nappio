import {
  LiveKitRoom,
  useConnectionState,
  useRemoteParticipants,
  useRNE2EEManager,
  useRoomContext,
  useTrackVolume,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { startIOSPIP } from '@livekit/react-native-webrtc';
import {
  ConnectionState,
  MediaDeviceFailure,
  RemoteAudioTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/design';
import { startMonitoringAudioSession, stopMonitoringAudioSession } from '@/livekit/audio-session';
import { connectionStateToMonitorStatus } from '@/livekit/connection-state';
import {
  BABY_DEVICE_STATUS_TOPIC,
  parseBabyDeviceStatus,
  type BabyDeviceStatus,
} from '@/monitoring/baby-device-status';
import {
  advanceSoundAlertDetector,
  createSoundAlertDetectorState,
  soundAlertConfigForSensitivity,
  type SoundAlertSensitivity,
} from '@/monitoring/sound-alert-detector';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

type ParentRoomProps = {
  session: MonitorSession;
  audioOnly: boolean;
  pipRequest: number;
  talking: boolean;
  soundSensitivity: SoundAlertSensitivity;
  onStatusChange: (status: MonitorStatus) => void;
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
  onBabyConnectedChange,
  onBabyDeviceStatusChange,
  onSoundDetected,
  onTalkError,
  onError,
}: ParentRoomProps) {
  const { e2eeManager } = useRNE2EEManager({ sharedKey: session.encryptionKey });
  const room = useMemo(
    () =>
      new Room({
        adaptiveStream: { pixelDensity: 'screen' },
        dynacast: true,
        encryption: { e2eeManager },
      }),
    [e2eeManager],
  );
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    let active = true;
    startMonitoringAudioSession('parent')
      .then(() => active && setAudioReady(true))
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : 'Could not start audio playback.');
      });
    return () => {
      active = false;
      room.disconnect();
      void stopMonitoringAudioSession();
    };
  }, [onError, room]);

  if (!audioReady) {
    return <MonitorPlaceholder label="Preparing audio…" />;
  }

  return (
    <LiveKitRoom
      room={room}
      serverUrl={session.livekitUrl}
      token={session.token}
      connect
      connectOptions={{ autoSubscribe: true }}
      audio={false}
      video={false}
      onError={(error) => onError(error.message)}
      onMediaDeviceFailure={(failure) => onTalkError(mediaDeviceFailureMessage(failure))}
      onEncryptionError={() => onError('The encrypted media session could not be established.')}>
      <ParentRoomContent
        audioOnly={audioOnly}
        pipRequest={pipRequest}
        talking={talking}
        soundSensitivity={soundSensitivity}
        onBabyConnectedChange={onBabyConnectedChange}
        onBabyDeviceStatusChange={onBabyDeviceStatusChange}
        onSoundDetected={onSoundDetected}
        onTalkError={onTalkError}
        onStatusChange={onStatusChange}
      />
    </LiveKitRoom>
  );
}

function ParentRoomContent({
  audioOnly,
  pipRequest,
  talking,
  soundSensitivity,
  onBabyConnectedChange,
  onBabyDeviceStatusChange,
  onSoundDetected,
  onTalkError,
  onStatusChange,
}: Pick<
  ParentRoomProps,
  | 'audioOnly'
  | 'pipRequest'
  | 'talking'
  | 'soundSensitivity'
  | 'onBabyConnectedChange'
  | 'onBabyDeviceStatusChange'
  | 'onSoundDetected'
  | 'onTalkError'
  | 'onStatusChange'
>) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const participants = useRemoteParticipants();
  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  const babyVideo = videoTracks.find(
    (track) => !track.participant.isLocal && track.participant.attributes.role === 'baby',
  );
  const babyAudio = audioTracks.find(
    (track) => !track.participant.isLocal && track.participant.attributes.role === 'baby',
  );
  const volume = useTrackVolume(babyAudio);
  const soundAlertState = useRef(createSoundAlertDetectorState());
  const videoRef = useRef<ComponentRef<typeof VideoTrack>>(null);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    let cancelled = false;
    const localParticipant = room.localParticipant;

    void localParticipant
      .setMicrophoneEnabled(
        talking,
        talking
          ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : undefined,
      )
      .then(() => {
        if (cancelled && talking) void localParticipant.setMicrophoneEnabled(false);
      })
      .catch((reason: unknown) => {
        if (!talking) {
          console.warn('Could not stop push-to-talk audio.', reason);
          return;
        }
        onTalkError(reason instanceof Error ? reason.message : 'The microphone could not start.');
      });

    return () => {
      cancelled = true;
      if (talking) void localParticipant.setMicrophoneEnabled(false);
    };
  }, [connectionState, onTalkError, room, talking]);

  useEffect(() => {
    onStatusChange(connectionStateToMonitorStatus(connectionState));
  }, [connectionState, onStatusChange]);

  useEffect(() => {
    onBabyConnectedChange(
      participants.some((participant) => participant.attributes.role === 'baby'),
    );
  }, [onBabyConnectedChange, participants]);

  useEffect(() => {
    const handleDataReceived = (
      payload: Uint8Array,
      participant: { attributes: Record<string, string> } | undefined,
      _kind: unknown,
      topic: string | undefined,
    ) => {
      if (topic !== BABY_DEVICE_STATUS_TOPIC || participant?.attributes.role !== 'baby') return;
      const deviceStatus = parseBabyDeviceStatus(payload);
      if (deviceStatus) onBabyDeviceStatusChange(deviceStatus);
    };
    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [onBabyDeviceStatusChange, room]);

  useEffect(() => {
    soundAlertState.current = createSoundAlertDetectorState();
  }, [soundSensitivity]);

  useEffect(() => {
    const result = advanceSoundAlertDetector(
      soundAlertState.current,
      babyAudio ? volume : 0,
      Date.now(),
      soundAlertConfigForSensitivity(soundSensitivity),
    );
    soundAlertState.current = result.state;
    if (result.shouldNotify) onSoundDetected();
  }, [babyAudio, onSoundDetected, soundSensitivity, volume]);

  useEffect(() => {
    if (Platform.OS === 'ios' && pipRequest > 0 && babyVideo) {
      startIOSPIP(videoRef);
    }
  }, [babyVideo, pipRequest]);

  useEffect(() => {
    if (!babyAudio) return;
    const track = babyAudio.publication.track;
    if (track instanceof RemoteAudioTrack) track.setVolume(1);
  }, [babyAudio]);

  useEffect(() => {
    const setCameraSubscription = (publication: RemoteTrackPublication) => {
      if (publication.source === Track.Source.Camera) {
        publication.setSubscribed(!audioOnly);
      }
    };
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.videoTrackPublications.values()) {
        setCameraSubscription(publication);
      }
    }
    room.on(RoomEvent.TrackPublished, setCameraSubscription);
    return () => {
      room.off(RoomEvent.TrackPublished, setCameraSubscription);
    };
  }, [audioOnly, room]);

  if (audioOnly) {
    return <AudioOnlyView volume={volume} connected={Boolean(babyAudio)} />;
  }
  if (!babyVideo) {
    return <MonitorPlaceholder label="Waiting for the baby camera…" />;
  }
  return (
    <VideoTrack
      ref={videoRef}
      trackRef={babyVideo}
      style={styles.video}
      objectFit="cover"
      iosPIP={{
        enabled: true,
        preferredSize: { width: 9, height: 16 },
        startAutomatically: false,
        stopAutomatically: true,
      }}
    />
  );
}

function AudioOnlyView({ volume, connected }: { volume: number; connected: boolean }) {
  const weights = [0.35, 0.55, 0.8, 0.48, 1, 0.65, 0.4, 0.72, 0.5, 0.3];
  return (
    <View style={styles.audioOnly}>
      <View style={styles.audioOrb}>
        <Text style={styles.audioIcon}>♪</Text>
      </View>
      <Text style={styles.audioTitle}>Listening in audio only</Text>
      <View style={styles.meter} accessibilityLabel="Live audio level">
        {weights.map((weight, index) => (
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

function mediaDeviceFailureMessage(failure?: MediaDeviceFailure) {
  if (failure === MediaDeviceFailure.PermissionDenied) {
    return 'Microphone permission was denied. Allow it in Settings and try again.';
  }
  if (failure === MediaDeviceFailure.DeviceInUse) {
    return 'The microphone is being used by another app.';
  }
  if (failure === MediaDeviceFailure.NotFound) {
    return 'Nappio could not find an available microphone.';
  }
  return 'The microphone could not start.';
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
