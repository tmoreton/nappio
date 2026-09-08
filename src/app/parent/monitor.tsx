import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ConnectionStatus } from '@/components/connection-status';
import { Screen } from '@/components/screen';
import { palette, radii, spacing } from '@/constants/design';
import { showMonitoringAudioRoutePicker } from '@/livekit/audio-session';
import { ParentRoom } from '@/livekit/parent-room';
import {
  getMonitoringAlertPermission,
  notifyMonitoringInterrupted,
  notifySoundDetected,
  requestMonitoringAlerts,
  type MonitoringAlertPermission,
} from '@/monitoring/notifications';
import { PairingApiError, resumeSession } from '@/pairing/api';
import { useMonitorSession } from '@/state/monitor-session';
import { hasFreshAccessToken } from '@/state/session-lifecycle';
import type { MonitorStatus } from '@/types/monitor';

export default function MonitorScreen() {
  const { session, isHydrated, setSession, clearSession } = useMonitorSession();
  const [status, setStatus] = useState<MonitorStatus>('connecting');
  const [babyConnected, setBabyConnected] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrepared, setIsPrepared] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [alertPermission, setAlertPermission] = useState<MonitoringAlertPermission>('undetermined');
  const appState = useRef(AppState.currentState);
  const connectedOnce = useRef(false);
  const babySeen = useRef(false);
  const interruptionAlertSent = useRef(false);
  const parentSession = session?.role === 'parent' ? session : null;

  const handleStatusChange = useCallback((nextStatus: MonitorStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'connected') {
      connectedOnce.current = true;
      interruptionAlertSent.current = false;
      setError(null);
    } else if (
      connectedOnce.current &&
      (nextStatus === 'disconnected' || nextStatus === 'failed') &&
      appState.current !== 'active' &&
      !interruptionAlertSent.current
    ) {
      interruptionAlertSent.current = true;
      void notifyMonitoringInterrupted(
        'The connection to the Baby Unit was interrupted. Open Nappio to reconnect.',
      ).catch((notificationError: unknown) => {
        console.warn('Could not show the monitoring interruption alert.', notificationError);
      });
    }
  }, []);

  const handleRoomError = useCallback((message: string) => {
    setStatus('failed');
    setError(message);
    if (connectedOnce.current && appState.current !== 'active' && !interruptionAlertSent.current) {
      interruptionAlertSent.current = true;
      void notifyMonitoringInterrupted(
        'The connection to the Baby Unit was interrupted. Open Nappio to reconnect.',
      ).catch((notificationError: unknown) => {
        console.warn('Could not show the monitoring interruption alert.', notificationError);
      });
    }
  }, []);

  const handleBabyConnectedChange = useCallback((connected: boolean) => {
    setBabyConnected(connected);
    if (connected) {
      babySeen.current = true;
      interruptionAlertSent.current = false;
    } else if (babySeen.current && appState.current !== 'active' && !interruptionAlertSent.current) {
      interruptionAlertSent.current = true;
      void notifyMonitoringInterrupted(
        'The Baby Unit left the monitoring room. Open Nappio to check it.',
      ).catch((notificationError: unknown) => {
        console.warn('Could not show the monitoring interruption alert.', notificationError);
      });
    }
  }, []);

  const handleSoundDetected = useCallback(() => {
    if (appState.current === 'active' || alertPermission !== 'granted') return;
    void notifySoundDetected().catch((notificationError: unknown) => {
      console.warn('Could not show the sound alert.', notificationError);
    });
  }, [alertPermission]);

  useEffect(() => {
    if (!isHydrated || isPrepared) return;
    if (!parentSession) {
      router.replace('/parent/pair');
      return;
    }

    let cancelled = false;
    const currentSession = parentSession;
    async function prepare() {
      if (hasFreshAccessToken(currentSession)) {
        setIsPrepared(true);
        return;
      }
      const recovered = await resumeSession(currentSession.recoveryToken);
      if (cancelled) return;
      if (recovered.role !== 'parent') throw new Error('The saved session belongs to the Baby Unit.');
      setSession(recovered);
      setIsPrepared(true);
    }
    prepare().catch((reason: unknown) => {
      if (cancelled) return;
      if (reason instanceof PairingApiError && reason.status === 410) clearSession();
      setStatus('failed');
      setError(reason instanceof Error ? reason.message : 'Could not restore monitoring.');
    });
    return () => {
      cancelled = true;
    };
  }, [clearSession, isHydrated, isPrepared, parentSession, recoveryAttempt, setSession]);

  useEffect(() => {
    void getMonitoringAlertPermission().then(setAlertPermission).catch(() => undefined);
    const subscription = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState;
      if (nextState !== 'active') {
        setAudioOnly(true);
      } else {
        void getMonitoringAlertPermission().then(setAlertPermission).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  function disconnect() {
    clearSession();
    router.replace('/');
  }

  async function enableAlerts() {
    if (alertPermission === 'denied') {
      await Linking.openSettings();
      return;
    }
    const permission = await requestMonitoringAlerts();
    setAlertPermission(permission);
  }

  if (!isHydrated || !parentSession) {
    return <View style={styles.container} />;
  }

  if (!isPrepared) {
    return (
      <Screen contentStyle={styles.recoveryContent}>
        <ConnectionStatus status={status} />
        <Text style={styles.recoveryTitle}>
          {error ? 'Monitoring could not resume' : 'Restoring monitoring…'}
        </Text>
        <Text style={styles.recoveryCopy}>
          {error ?? 'Refreshing the private connection to the Baby Unit.'}
        </Text>
        {error ? (
          <View style={styles.recoveryActions}>
            <ActionButton
              label="Try Again"
              onPress={() => {
                setError(null);
                setStatus('connecting');
                setRecoveryAttempt((value) => value + 1);
              }}
            />
            <ActionButton
              label="Pair Again"
              variant="secondary"
              onPress={() => {
                clearSession();
                router.replace('/parent/pair');
              }}
            />
          </View>
        ) : null}
      </Screen>
    );
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
        onBabyConnectedChange={handleBabyConnectedChange}
        onSoundDetected={handleSoundDetected}
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
          {alertPermission === 'granted' ? (
            <View style={styles.alertsEnabled}>
              <View style={styles.alertsEnabledDot} />
              <Text style={styles.alertsEnabledText}>Sound and connection alerts on</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void enableAlerts()}
              style={({ pressed }) => [styles.alertsCard, pressed && styles.pressed]}>
              <View style={styles.alertsCopy}>
                <Text style={styles.alertsTitle}>Turn on monitoring alerts</Text>
                <Text style={styles.alertsDetail}>
                  {alertPermission === 'denied'
                    ? 'Enable notification sounds in Settings to receive monitoring alerts.'
                    : 'Get alerts for sustained sound or a lost connection while this screen is inactive.'}
                </Text>
              </View>
              <Text style={styles.alertsAction}>{alertPermission === 'denied' ? 'Settings' : 'Enable'}</Text>
            </Pressable>
          )}
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
  recoveryContent: { justifyContent: 'center', paddingBottom: spacing.xxl },
  recoveryTitle: { color: palette.ink, fontSize: 30, fontWeight: '800', marginTop: spacing.lg },
  recoveryCopy: { color: palette.muted, fontSize: 16, lineHeight: 24, marginTop: spacing.sm },
  recoveryActions: { gap: spacing.sm, marginTop: spacing.xl },
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
  alertsCard: {
    alignItems: 'center',
    backgroundColor: palette.yellowWash,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 12,
  },
  alertsCopy: { flex: 1 },
  alertsTitle: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  alertsDetail: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  alertsAction: { color: palette.yellow, fontSize: 12, fontWeight: '800' },
  alertsEnabled: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(230,238,232,0.94)',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  alertsEnabledDot: { backgroundColor: palette.sageDark, borderRadius: 4, height: 8, width: 8 },
  alertsEnabledText: { color: palette.sageDark, fontSize: 11, fontWeight: '800' },
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
  pressed: { opacity: 0.7 },
});
