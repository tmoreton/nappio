import {
  LiveKitRoom,
  useConnectionState,
  useRemoteParticipants,
  useRNE2EEManager,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import * as Battery from 'expo-battery';
import {
  ConnectionState,
  MediaDeviceFailure,
  RemoteAudioTrack,
  Room,
  Track,
  VideoPresets,
} from 'livekit-client';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/design';
import { startMonitoringAudioSession, stopMonitoringAudioSession } from '@/livekit/audio-session';
import { connectionStateToMonitorStatus } from '@/livekit/connection-state';
import {
  BABY_DEVICE_STATUS_TOPIC,
  encodeBabyDeviceStatus,
} from '@/monitoring/baby-device-status';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

const DEVICE_STATUS_INTERVAL_MS = 15_000;

type BabyRoomProps = {
  session: MonitorSession;
  onStatusChange: (status: MonitorStatus) => void;
  onParentCountChange: (count: number) => void;
  onError: (message: string) => void;
};

export function BabyRoom({
  session,
  onStatusChange,
  onParentCountChange,
  onError,
}: BabyRoomProps) {
  const { e2eeManager } = useRNE2EEManager({ sharedKey: session.encryptionKey });
  const room = useMemo(
    () =>
      new Room({
        adaptiveStream: { pixelDensity: 'screen' },
        dynacast: true,
        encryption: { e2eeManager },
        publishDefaults: {
          degradationPreference: 'maintain-resolution',
          videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
          videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h720],
        },
      }),
    [e2eeManager],
  );
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    let active = true;
    startMonitoringAudioSession('baby')
      .then(() => active && setAudioReady(true))
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : 'Could not start the audio session.');
      });
    return () => {
      active = false;
      room.disconnect();
      void stopMonitoringAudioSession();
    };
  }, [onError, room]);

  if (!audioReady) {
    return <CameraPlaceholder label="Preparing microphone…" />;
  }

  return (
    <LiveKitRoom
      room={room}
      serverUrl={session.livekitUrl}
      token={session.token}
      connect
      connectOptions={{ autoSubscribe: true }}
      audio={{ echoCancellation: true, noiseSuppression: false, autoGainControl: true }}
      video={{
        facingMode: 'environment',
        resolution: { width: 1920, height: 1080, frameRate: 15 },
      }}
      onError={(error) => onError(error.message)}
      onMediaDeviceFailure={(failure) => onError(mediaDeviceFailureMessage(failure))}
      onEncryptionError={() => onError('The encrypted media session could not be established.')}>
      <BabyRoomContent
        onParentCountChange={onParentCountChange}
        onStatusChange={onStatusChange}
      />
    </LiveKitRoom>
  );
}

function BabyRoomContent({
  onParentCountChange,
  onStatusChange,
}: Pick<BabyRoomProps, 'onParentCountChange' | 'onStatusChange'>) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const parents = useRemoteParticipants();
  const cameraTracks = useTracks([Track.Source.Camera]);
  const microphoneTracks = useTracks([Track.Source.Microphone]);
  const localCamera = cameraTracks.find((track) => track.participant.isLocal);
  const localMicrophone = microphoneTracks.find((track) => track.participant.isLocal);

  useEffect(() => {
    for (const trackRef of microphoneTracks) {
      if (trackRef.participant.isLocal || trackRef.participant.attributes.role !== 'parent') {
        continue;
      }
      const track = trackRef.publication.track;
      if (track instanceof RemoteAudioTrack) track.setVolume(1);
    }
  }, [microphoneTracks]);

  useEffect(() => {
    onStatusChange(connectionStateToMonitorStatus(connectionState));
  }, [connectionState, onStatusChange]);

  useEffect(() => {
    onParentCountChange(
      parents.filter((participant) => participant.attributes.role === 'parent').length,
    );
  }, [onParentCountChange, parents]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    let cancelled = false;

    async function publishDeviceStatus() {
      try {
        const power = await Battery.getPowerStateAsync();
        if (cancelled) return;
        const chargingStates = [
          Battery.BatteryState.CHARGING,
          Battery.BatteryState.FULL,
          Battery.BatteryState.NOT_CHARGING,
        ];
        await room.localParticipant.publishData(
          encodeBabyDeviceStatus({
            batteryLevel: power.batteryLevel >= 0 ? power.batteryLevel : null,
            isCharging:
              power.batteryState === Battery.BatteryState.UNKNOWN
                ? null
                : chargingStates.includes(power.batteryState),
            lowPowerMode: power.lowPowerMode,
          }),
          { reliable: true, topic: BABY_DEVICE_STATUS_TOPIC },
        );
      } catch (reason) {
        console.warn('Could not share Baby Unit power status.', reason);
      }
    }

    void publishDeviceStatus();
    const interval = setInterval(() => void publishDeviceStatus(), DEVICE_STATUS_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connectionState, room]);

  if (!localCamera || !localMicrophone) {
    return <CameraPlaceholder label="Starting camera and microphone…" />;
  }

  return <VideoTrack trackRef={localCamera} style={styles.video} objectFit="cover" mirror={false} />;
}

function mediaDeviceFailureMessage(failure?: MediaDeviceFailure) {
  if (failure === MediaDeviceFailure.PermissionDenied) {
    return 'Camera or microphone permission was denied. Allow both in Settings and try again.';
  }
  if (failure === MediaDeviceFailure.DeviceInUse) {
    return 'The camera or microphone is being used by another app.';
  }
  if (failure === MediaDeviceFailure.NotFound) {
    return 'Nappio could not find an available camera or microphone.';
  }
  return 'The camera or microphone could not start.';
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
