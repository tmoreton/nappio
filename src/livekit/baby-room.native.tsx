import {
  LiveKitRoom,
  useConnectionState,
  useRemoteParticipants,
  useRNE2EEManager,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Room, Track } from 'livekit-client';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/design';
import { startMonitoringAudioSession, stopMonitoringAudioSession } from '@/livekit/audio-session';
import { connectionStateToMonitorStatus } from '@/livekit/connection-state';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

type BabyRoomProps = {
  session: MonitorSession;
  onStatusChange: (status: MonitorStatus) => void;
  onParentConnectedChange: (connected: boolean) => void;
  onError: (message: string) => void;
};

export function BabyRoom({
  session,
  onStatusChange,
  onParentConnectedChange,
  onError,
}: BabyRoomProps) {
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
      connectOptions={{ autoSubscribe: false }}
      audio={{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }}
      video={{
        facingMode: 'environment',
        resolution: { width: 1280, height: 720, frameRate: 15 },
      }}
      onError={(error) => onError(error.message)}
      onEncryptionError={() => onError('The encrypted media session could not be established.')}>
      <BabyRoomContent
        onParentConnectedChange={onParentConnectedChange}
        onStatusChange={onStatusChange}
      />
    </LiveKitRoom>
  );
}

function BabyRoomContent({
  onParentConnectedChange,
  onStatusChange,
}: Pick<BabyRoomProps, 'onParentConnectedChange' | 'onStatusChange'>) {
  const connectionState = useConnectionState();
  const parents = useRemoteParticipants();
  const cameraTracks = useTracks([Track.Source.Camera]);
  const localCamera = cameraTracks.find((track) => track.participant.isLocal);

  useEffect(() => {
    onStatusChange(connectionStateToMonitorStatus(connectionState));
  }, [connectionState, onStatusChange]);

  useEffect(() => {
    onParentConnectedChange(parents.some((participant) => participant.attributes.role === 'parent'));
  }, [onParentConnectedChange, parents]);

  if (!localCamera) {
    return <CameraPlaceholder label="Starting camera…" />;
  }

  return <VideoTrack trackRef={localCamera} style={styles.video} objectFit="cover" mirror={false} />;
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
