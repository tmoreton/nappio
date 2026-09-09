import { Camera } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ConnectionStatus } from '@/components/connection-status';
import { Screen } from '@/components/screen';
import { palette, radii, spacing } from '@/constants/design';
import { showMonitoringAudioRoutePicker } from '@/livekit/audio-session';
import { ParentRoom } from '@/realtime/parent-room';
import {
  formatBabyDeviceStatus,
  isBabyBatteryLow,
  type BabyDeviceStatus,
  type ReceivedBabyDeviceStatus,
} from '@/monitoring/baby-device-status';
import {
  getMonitoringAlertPermission,
  notifyBabyBatteryLow,
  notifyBabyPowerDisconnected,
  notifyMonitoringInterrupted,
  notifyMonitoringTest,
  notifySoundDetected,
  requestMonitoringAlerts,
  type MonitoringAlertPermission,
} from '@/monitoring/notifications';
import {
  loadSoundAlertSensitivity,
  saveSoundAlertSensitivity,
} from '@/monitoring/preferences';
import {
  SOUND_ALERT_SENSITIVITIES,
  type SoundAlertSensitivity,
} from '@/monitoring/sound-alert-detector';
import { endSession, PairingApiError, resumeSession } from '@/pairing/api';
import { useMonitorSession } from '@/state/monitor-session';
import type { MonitorStatus } from '@/types/monitor';

export default function MonitorScreen() {
  const { session, isHydrated, setSession, refreshSessionExpiry, clearSession } = useMonitorSession();
  const [status, setStatus] = useState<MonitorStatus>('connecting');
  const [babyConnected, setBabyConnected] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrepared, setIsPrepared] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [alertPermission, setAlertPermission] = useState<MonitoringAlertPermission>('undetermined');
  const [soundSensitivity, setSoundSensitivity] = useState<SoundAlertSensitivity>('standard');
  const [babyDeviceStatus, setBabyDeviceStatus] = useState<ReceivedBabyDeviceStatus | null>(null);
  const [statusClock, setStatusClock] = useState(0);
  const [pipRequest, setPipRequest] = useState(0);
  const [talking, setTalking] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const appState = useRef(AppState.currentState);
  const talkPressHeld = useRef(false);
  const pipRequested = useRef(false);
  const connectedOnce = useRef(false);
  const babySeen = useRef(false);
  const interruptionAlertSent = useRef(false);
  const previousBabyDeviceStatus = useRef<BabyDeviceStatus | null>(null);
  const lowBatteryAlertSent = useRef(false);
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
    if (!connected) {
      talkPressHeld.current = false;
      setTalking(false);
    }
  }, []);

  const handleTalkError = useCallback(
    (message: string) => {
      talkPressHeld.current = false;
      setTalking(false);
      Alert.alert('Push-to-talk unavailable', message);
    },
    [],
  );

  const handleSoundDetected = useCallback(() => {
    if (appState.current === 'active' || alertPermission !== 'granted') return;
    void notifySoundDetected().catch((notificationError: unknown) => {
      console.warn('Could not show the sound alert.', notificationError);
    });
  }, [alertPermission]);

  const handleBabyDeviceStatusChange = useCallback(
    (nextStatus: BabyDeviceStatus) => {
      const previousStatus = previousBabyDeviceStatus.current;
      previousBabyDeviceStatus.current = nextStatus;
      setBabyDeviceStatus({ ...nextStatus, receivedAt: Date.now() });
      setStatusClock(Date.now());

      const isLow = isBabyBatteryLow(nextStatus);
      if (!isLow) lowBatteryAlertSent.current = false;
      if (appState.current === 'active' || alertPermission !== 'granted') return;

      if (previousStatus?.isCharging === true && nextStatus.isCharging === false) {
        void notifyBabyPowerDisconnected().catch((notificationError: unknown) => {
          console.warn('Could not show the Baby Unit power alert.', notificationError);
        });
      }
      if (isLow && !lowBatteryAlertSent.current && nextStatus.batteryLevel !== null) {
        lowBatteryAlertSent.current = true;
        void notifyBabyBatteryLow(nextStatus.batteryLevel * 100).catch(
          (notificationError: unknown) => {
            console.warn('Could not show the Baby Unit battery alert.', notificationError);
          },
        );
      }
    },
    [alertPermission],
  );

  useEffect(() => {
    if (!isHydrated || isPrepared) return;
    if (!parentSession) {
      router.replace('/parent/pair');
      return;
    }

    let cancelled = false;
    const currentSession = parentSession;
    async function prepare() {
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
    let cancelled = false;
    void loadSoundAlertSensitivity()
      .then((sensitivity) => {
        if (!cancelled) setSoundSensitivity(sensitivity);
      })
      .catch((preferenceError: unknown) => {
        console.warn('Could not load monitoring preferences.', preferenceError);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!babyDeviceStatus) return;
    const interval = setInterval(() => setStatusClock(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, [babyDeviceStatus]);

  useEffect(() => {
    void getMonitoringAlertPermission().then(setAlertPermission).catch(() => undefined);
    const subscription = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState;
      if (nextState !== 'active') {
        talkPressHeld.current = false;
        setTalking(false);
        if (!pipRequested.current) setAudioOnly(true);
      } else {
        pipRequested.current = false;
        void getMonitoringAlertPermission().then(setAlertPermission).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  function disconnect() {
    talkPressHeld.current = false;
    setTalking(false);
    setSettingsVisible(false);
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

  function chooseSoundSensitivity(sensitivity: SoundAlertSensitivity) {
    setSoundSensitivity(sensitivity);
    void saveSoundAlertSensitivity(sensitivity).catch((preferenceError: unknown) => {
      console.warn('Could not save monitoring preferences.', preferenceError);
    });
  }

  function startPictureInPicture() {
    if (Platform.OS !== 'ios' || audioOnly || !babyConnected) return;
    pipRequested.current = true;
    setPipRequest((request) => request + 1);
    setTimeout(() => {
      if (appState.current === 'active') pipRequested.current = false;
    }, 2_000);
  }

  async function beginTalking() {
    if (!babyConnected) return;
    talkPressHeld.current = true;
    try {
      let permission = await Camera.getMicrophonePermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Camera.requestMicrophonePermissionsAsync();
      }
      if (!talkPressHeld.current) return;
      if (!permission.granted) {
        talkPressHeld.current = false;
        Alert.alert(
          'Microphone access needed',
          'Allow microphone access in Settings to use push-to-talk.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
      setTalking(true);
    } catch (reason) {
      talkPressHeld.current = false;
      handleTalkError(
        reason instanceof Error ? reason.message : 'Microphone permission could not be checked.',
      );
    }
  }

  function stopTalking() {
    talkPressHeld.current = false;
    setTalking(false);
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
                if (parentSession) {
                  void endSession(parentSession.recoveryToken).catch((reason: unknown) =>
                    console.warn('Could not immediately revoke the Parent Unit session.', reason),
                  );
                }
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
    <>
      <StatusBar style={settingsVisible ? 'dark' : 'light'} />
      <View style={styles.container}>
        <ParentRoom
          key={parentSession.recoveryToken}
          session={parentSession}
          audioOnly={audioOnly}
          pipRequest={pipRequest}
          talking={talking}
          soundSensitivity={soundSensitivity}
          onStatusChange={handleStatusChange}
          onSessionRenewed={refreshSessionExpiry}
          onBabyConnectedChange={handleBabyConnectedChange}
          onBabyDeviceStatusChange={handleBabyDeviceStatusChange}
          onSoundDetected={handleSoundDetected}
          onTalkError={handleTalkError}
          onError={handleRoomError}
        />

        <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
          <View style={styles.topArea}>
            <View style={styles.topRow}>
              <ConnectionStatus compact status={status} label={statusLabel} />
              <View style={styles.topActions}>
                {Platform.OS === 'ios' && !audioOnly ? (
                  <Pressable
                    accessibilityHint="Keeps the live video visible over other apps"
                    accessibilityLabel="Open Picture in Picture"
                    accessibilityRole="button"
                    disabled={!babyConnected}
                    onPress={startPictureInPicture}
                    style={[styles.routeButton, !babyConnected && styles.disabledButton]}>
                    <Text style={styles.routeButtonText}>PiP</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityHint="Opens audio output and monitoring alert options"
                  accessibilityLabel="Monitor settings"
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => setSettingsVisible(true)}
                  style={styles.routeButton}>
                  <Text style={styles.optionsButtonText}>•••</Text>
                </Pressable>
              </View>
            </View>
            {babyDeviceStatus && isBabyBatteryLow(babyDeviceStatus) ? (
              <View accessibilityLiveRegion="polite" style={[styles.deviceStatus, styles.deviceStatusWarning]}>
                <View style={[styles.deviceStatusDot, styles.deviceStatusWarningDot]} />
                <Text style={[styles.deviceStatusText, styles.deviceStatusWarningText]}>
                  {formatBabyDeviceStatus(babyDeviceStatus, statusClock)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.bottomArea}>
            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Monitoring interrupted</Text>
                <Text numberOfLines={2} style={styles.errorCopy}>{error}</Text>
              </View>
            ) : null}
            <View style={styles.controls}>
              <Pressable
                accessibilityHint={audioOnly ? 'Restores the camera stream' : 'Stops receiving video data'}
                accessibilityLabel={audioOnly ? 'Show video' : 'Audio only'}
                accessibilityRole="button"
                onPress={() => setAudioOnly((value) => !value)}
                style={styles.modeButton}>
                <Text style={styles.modeIcon}>{audioOnly ? '▶' : '♪'}</Text>
                <Text numberOfLines={2} style={styles.controlLabel}>
                  {audioOnly ? 'Show video' : 'Audio only'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityActions={[
                  { name: 'activate', label: talking ? 'Stop talking' : 'Start talking' },
                ]}
                accessibilityHint="Keep this button pressed while you speak"
                accessibilityLabel={talking ? 'Talking to Baby Unit' : 'Hold to talk to Baby Unit'}
                accessibilityRole="button"
                accessibilityState={{ disabled: !babyConnected }}
                disabled={!babyConnected}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName !== 'activate') return;
                  if (talking) stopTalking();
                  else void beginTalking();
                }}
                onPressIn={() => void beginTalking()}
                onPressOut={stopTalking}
                style={[
                  styles.talkButton,
                  talking && styles.talkButtonActive,
                  !babyConnected && styles.disabledButton,
                ]}>
                <Text style={[styles.talkIcon, talking && styles.talkTextActive]}>●</Text>
                <Text numberOfLines={2} style={[styles.controlLabel, styles.talkLabel, talking && styles.talkTextActive]}>
                  {talking ? 'Talking…' : 'Hold to talk'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityHint="Keeps this room available to rejoin from the home screen"
                accessibilityLabel="Leave monitor"
                accessibilityRole="button"
                onPress={disconnect}
                style={styles.disconnectButton}>
                <Text style={styles.disconnectText}>■</Text>
                <Text style={[styles.controlLabel, styles.disconnectLabel]}>Leave</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
        presentationStyle="pageSheet"
        visible={settingsVisible}>
        <SafeAreaView style={styles.settingsScreen}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Monitor settings</Text>
            <Pressable
              accessibilityLabel="Close monitor settings"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setSettingsVisible(false)}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.settingsContent}
            showsVerticalScrollIndicator={false}>
            {Platform.OS === 'ios' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void showMonitoringAudioRoutePicker()}
                style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>
                <View style={styles.settingsRowCopy}>
                  <Text style={styles.settingsRowTitle}>Audio output</Text>
                  <Text style={styles.settingsRowDetail}>
                    Choose this phone, a speaker, or headphones.
                  </Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </Pressable>
            ) : null}

            {babyDeviceStatus ? (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionLabel}>BABY UNIT</Text>
                <Text style={styles.settingsSectionValue}>
                  {formatBabyDeviceStatus(babyDeviceStatus, statusClock)}
                </Text>
              </View>
            ) : null}

            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionLabel}>MONITORING ALERTS</Text>
              <Text style={styles.settingsSectionValue}>
                {alertPermission === 'granted'
                  ? 'Sound, connection, and Baby Unit power alerts are on.'
                  : 'Optional alerts can notify you while Nappio is in the background.'}
              </Text>
              {alertPermission === 'granted' ? (
                <>
                  <View
                    accessibilityLabel="Sound alert sensitivity"
                    accessibilityRole="radiogroup"
                    style={styles.sensitivityPicker}>
                    {SOUND_ALERT_SENSITIVITIES.map((sensitivity) => {
                      const selected = soundSensitivity === sensitivity;
                      return (
                        <Pressable
                          key={sensitivity}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() => chooseSoundSensitivity(sensitivity)}
                          style={[
                            styles.sensitivityOption,
                            selected && styles.sensitivityOptionActive,
                          ]}>
                          <Text
                            style={[
                              styles.sensitivityLabel,
                              selected && styles.sensitivityLabelActive,
                            ]}>
                            {sensitivity[0]!.toUpperCase() + sensitivity.slice(1)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void notifyMonitoringTest()}
                    style={({ pressed }) => [styles.settingsAction, pressed && styles.pressed]}>
                    <Text style={styles.settingsActionText}>Send test alert</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void enableAlerts()}
                  style={({ pressed }) => [styles.settingsAction, pressed && styles.pressed]}>
                  <Text style={styles.settingsActionText}>
                    {alertPermission === 'denied' ? 'Open notification settings' : 'Turn on alerts'}
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
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
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topArea: { gap: spacing.sm },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', gap: spacing.sm },
  routeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 46,
    paddingHorizontal: 13,
  },
  routeButtonText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  optionsButtonText: { color: palette.ink, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  disabledButton: { opacity: 0.45 },
  deviceStatus: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(230,238,232,0.94)',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 7,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deviceStatusWarning: { backgroundColor: 'rgba(255,235,232,0.96)' },
  deviceStatusDot: { backgroundColor: palette.sageDark, borderRadius: 4, height: 8, width: 8 },
  deviceStatusWarningDot: { backgroundColor: palette.red },
  deviceStatusText: { color: palette.sageDark, flexShrink: 1, fontSize: 11, fontWeight: '800' },
  deviceStatusWarningText: { color: palette.red },
  bottomArea: { gap: spacing.sm },
  sensitivityPicker: {
    backgroundColor: palette.sageWash,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
    marginTop: spacing.md,
    padding: 4,
  },
  sensitivityOption: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    minHeight: 30,
    justifyContent: 'center',
  },
  sensitivityOptionActive: { backgroundColor: palette.sageDark },
  sensitivityLabel: { color: palette.sageDark, fontSize: 11, fontWeight: '800' },
  sensitivityLabelActive: { color: palette.white },
  errorCard: { backgroundColor: 'rgba(246,226,223,0.96)', borderRadius: radii.md, padding: 12 },
  errorTitle: { color: palette.red, fontSize: 12, fontWeight: '800' },
  errorCopy: { color: palette.red, fontSize: 11, lineHeight: 15, marginTop: 2 },
  controls: { flexDirection: 'row', gap: spacing.sm },
  modeButton: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderRadius: radii.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 68,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  modeIcon: { color: palette.sageDark, fontSize: 19, fontWeight: '800' },
  controlLabel: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
    marginTop: 4,
    textAlign: 'center',
  },
  talkButton: {
    alignItems: 'center',
    backgroundColor: palette.sageWash,
    borderRadius: radii.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 68,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  talkButtonActive: { backgroundColor: palette.sageDark },
  talkIcon: { color: palette.sageDark, fontSize: 13 },
  talkLabel: { color: palette.sageDark },
  talkTextActive: { color: palette.white },
  disconnectButton: {
    alignItems: 'center',
    backgroundColor: palette.redWash,
    borderRadius: radii.md,
    flex: 0.82,
    justifyContent: 'center',
    minHeight: 68,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  disconnectText: { color: palette.red, fontSize: 14 },
  disconnectLabel: { color: palette.red },
  settingsScreen: { backgroundColor: palette.canvas, flex: 1, padding: spacing.lg },
  settingsContent: { paddingBottom: spacing.lg },
  settingsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  settingsTitle: { color: palette.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  closeButton: {
    backgroundColor: palette.sageWash,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  closeButtonText: { color: palette.sageDark, fontSize: 13, fontWeight: '800' },
  settingsRow: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    minHeight: 74,
    padding: spacing.md,
  },
  settingsRowCopy: { flex: 1 },
  settingsRowTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  settingsRowDetail: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  settingsChevron: { color: palette.sageDark, fontSize: 30, fontWeight: '300', marginLeft: spacing.sm },
  settingsSection: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: 12,
    padding: spacing.md,
  },
  settingsSectionLabel: {
    color: palette.sageDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  settingsSectionValue: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  settingsAction: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: 12,
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  settingsActionText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
