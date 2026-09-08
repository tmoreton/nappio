import { Camera } from 'expo-camera';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ConnectionStatus } from '@/components/connection-status';
import { PairingCode } from '@/components/pairing-code';
import { palette, radii, spacing } from '@/constants/design';
import { BabyRoom } from '@/livekit/baby-room';
import { createPairing } from '@/pairing/api';
import { useMonitorSession } from '@/state/monitor-session';
import type { MonitorStatus } from '@/types/monitor';

export default function BabyScreen() {
  useKeepAwake('nappio-baby-monitor');
  const { session, setSession, clearSession } = useMonitorSession();
  const [status, setStatus] = useState<MonitorStatus>('requesting-permissions');
  const [parentConnected, setParentConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimmed, setDimmed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const babySession = session?.role === 'baby' ? session : null;

  const handleRoomError = useCallback((message: string) => {
    setStatus('failed');
    setError(message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    clearSession();

    async function prepare() {
      if (Platform.OS !== 'web') {
        const camera = await Camera.requestCameraPermissionsAsync();
        const microphone = await Camera.requestMicrophonePermissionsAsync();
        if (!camera.granted || !microphone.granted) {
          throw new Error('Camera and microphone access are required to use this phone as the Baby Unit.');
        }
      }
      if (cancelled) return;
      setStatus('connecting');
      const pairing = await createPairing();
      if (cancelled) return;
      setSession({
        role: 'baby',
        roomId: pairing.roomId,
        token: pairing.babyToken,
        livekitUrl: pairing.livekitUrl,
        encryptionKey: pairing.encryptionKey,
        expiresAt: pairing.expiresAt,
        pairingCode: pairing.pairingCode,
      });
    }

    prepare().catch((reason: unknown) => {
      if (!cancelled) {
        setStatus('failed');
        setError(reason instanceof Error ? reason.message : 'Baby camera setup failed.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, clearSession, setSession]);

  function stopMonitoring() {
    clearSession();
    router.replace('/');
  }

  if (error || !babySession) {
    return (
      <SafeAreaView style={styles.setupSafe}>
        <View style={styles.setup}>
          <ConnectionStatus status={status} />
          <Text style={styles.setupTitle}>{error ? 'Camera could not start' : 'Starting Baby Unit…'}</Text>
          <Text style={styles.setupCopy}>
            {error ?? 'Checking permissions and creating a private encrypted room.'}
          </Text>
          {error ? (
            <View style={styles.setupActions}>
              <ActionButton
                label="Try Again"
                onPress={() => {
                  setError(null);
                  setStatus('requesting-permissions');
                  setAttempt((value) => value + 1);
                }}
              />
              {error.includes('access') ? (
                <ActionButton
                  label="Open Settings"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              ) : null}
              <ActionButton label="Cancel" variant="danger" onPress={stopMonitoring} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <BabyRoom
        session={babySession}
        onStatusChange={setStatus}
        onParentConnectedChange={setParentConnected}
        onError={handleRoomError}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topRow}>
          <ConnectionStatus
            status={status}
            label={status === 'connected' ? (parentConnected ? 'Parent connected' : 'Waiting for parent') : undefined}
          />
        </View>

        <View style={styles.bottomPanel}>
          {babySession.pairingCode ? (
            <PairingCode code={babySession.pairingCode} expiresAt={babySession.expiresAt} />
          ) : null}
          <View style={styles.controls}>
            <Pressable style={styles.smallButton} onPress={() => setDimmed(true)}>
              <Text style={styles.smallButtonText}>Dim screen</Text>
            </Pressable>
            <Pressable style={[styles.smallButton, styles.stopButton]} onPress={stopMonitoring}>
              <Text style={[styles.smallButtonText, styles.stopButtonText]}>Stop</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {dimmed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restore screen brightness"
          onPress={() => setDimmed(false)}
          style={styles.dimOverlay}>
          <ConnectionStatus
            status={status}
            label={parentConnected ? 'Parent connected' : 'Waiting for parent'}
          />
          <Text style={styles.dimTitle}>Monitoring</Text>
          <Text style={styles.dimHint}>Tap anywhere to restore screen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: palette.ink, flex: 1 },
  setupSafe: { backgroundColor: palette.canvas, flex: 1 },
  setup: {
    alignSelf: 'center',
    flex: 1,
    justifyContent: 'center',
    maxWidth: 560,
    padding: spacing.lg,
    width: '100%',
  },
  setupTitle: { color: palette.ink, fontSize: 30, fontWeight: '800', marginTop: spacing.lg },
  setupCopy: { color: palette.muted, fontSize: 16, lineHeight: 24, marginTop: spacing.sm },
  setupActions: { gap: spacing.sm, marginTop: spacing.xl },
  overlay: {
    bottom: 0,
    justifyContent: 'space-between',
    left: 0,
    padding: spacing.md,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topRow: { paddingTop: 44 },
  bottomPanel: { gap: spacing.sm },
  controls: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  smallButton: {
    backgroundColor: palette.paper,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  smallButtonText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  stopButton: { backgroundColor: palette.redWash },
  stopButtonText: { color: palette.red },
  dimOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dimTitle: { color: palette.white, fontSize: 24, fontWeight: '800', marginTop: spacing.lg },
  dimHint: { color: palette.muted, fontSize: 13, marginTop: spacing.sm },
});
