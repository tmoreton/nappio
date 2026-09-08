import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConnectionStatus } from '@/components/connection-status';
import { palette, radii, spacing } from '@/constants/design';
import { showMonitoringAudioRoutePicker } from '@/livekit/audio-session';
import { ParentRoom } from '@/livekit/parent-room';
import { useMonitorSession } from '@/state/monitor-session';
import type { MonitorStatus } from '@/types/monitor';

export default function MonitorScreen() {
  const { session, clearSession } = useMonitorSession();
  const [status, setStatus] = useState<MonitorStatus>('connecting');
  const [babyConnected, setBabyConnected] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parentSession = session?.role === 'parent' ? session : null;

  const handleStatusChange = useCallback((nextStatus: MonitorStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'connected') setError(null);
  }, []);

  const handleRoomError = useCallback((message: string) => {
    setStatus('failed');
    setError(message);
  }, []);

  useEffect(() => {
    if (!parentSession) {
      router.replace('/parent/pair');
    }
  }, [parentSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setAudioOnly(true);
      }
    });
    return () => subscription.remove();
  }, []);

  function disconnect() {
    clearSession();
    router.replace('/');
  }

  if (!parentSession) {
    return <View style={styles.container} />;
  }

  let statusLabel: string | undefined;
  if (status === 'connected') {
    statusLabel = babyConnected ? 'Monitoring live' : 'Baby unavailable';
  }

  return (
    <View style={styles.container}>
      <ParentRoom
        session={parentSession}
        audioOnly={audioOnly}
        onStatusChange={handleStatusChange}
        onBabyConnectedChange={setBabyConnected}
        onError={handleRoomError}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topRow}>
          <ConnectionStatus status={status} label={statusLabel} />
          <Pressable style={styles.routeButton} onPress={() => void showMonitoringAudioRoutePicker()}>
            <Text style={styles.routeButtonText}>Audio output</Text>
          </Pressable>
        </View>

        <View style={styles.bottomArea}>
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Monitoring interrupted</Text>
              <Text style={styles.errorCopy}>{error}</Text>
            </View>
          ) : null}
          {audioOnly ? (
            <View style={styles.lockNote}>
              <Text style={styles.lockNoteText}>You can lock this phone. Audio will continue playing.</Text>
            </View>
          ) : null}
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              style={styles.modeButton}
              onPress={() => setAudioOnly((value) => !value)}>
              <Text style={styles.modeIcon}>{audioOnly ? '▶' : '♪'}</Text>
              <View style={styles.modeCopy}>
                <Text style={styles.modeLabel}>{audioOnly ? 'Show Video' : 'Audio Only'}</Text>
                <Text style={styles.modeDetail}>
                  {audioOnly ? 'Resume the camera stream' : 'Stops receiving video data'}
                </Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.disconnectButton} onPress={disconnect}>
              <Text style={styles.disconnectText}>■</Text>
              <Text style={styles.disconnectLabel}>End</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: palette.ink, flex: 1 },
  overlay: {
    bottom: 0,
    justifyContent: 'space-between',
    left: 0,
    padding: spacing.md,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 44 },
  routeButton: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radii.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  routeButtonText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  bottomArea: { gap: spacing.sm },
  errorCard: { backgroundColor: palette.redWash, borderRadius: radii.md, padding: spacing.md },
  errorTitle: { color: palette.red, fontSize: 14, fontWeight: '800' },
  errorCopy: { color: palette.red, fontSize: 12, lineHeight: 17, marginTop: 3 },
  lockNote: {
    alignItems: 'center',
    backgroundColor: palette.sageWash,
    borderRadius: radii.md,
    padding: 12,
  },
  lockNoteText: { color: palette.sageDark, fontSize: 12, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: spacing.sm },
  modeButton: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderRadius: radii.md,
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    paddingHorizontal: spacing.md,
  },
  modeIcon: { color: palette.sageDark, fontSize: 23, fontWeight: '800' },
  modeCopy: { flex: 1 },
  modeLabel: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  modeDetail: { color: palette.muted, fontSize: 10, marginTop: 2 },
  disconnectButton: {
    alignItems: 'center',
    backgroundColor: palette.redWash,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 70,
    width: 72,
  },
  disconnectText: { color: palette.red, fontSize: 16 },
  disconnectLabel: { color: palette.red, fontSize: 11, fontWeight: '800', marginTop: 4 },
});
