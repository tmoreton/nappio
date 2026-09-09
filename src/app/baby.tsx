import { Camera } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ConnectionStatus } from '@/components/connection-status';
import { PairingCode } from '@/components/pairing-code';
import { palette, radii, spacing } from '@/constants/design';
import { BabyRoom } from '@/livekit/baby-room';
import { useMonitoringKeepAwake } from '@/livekit/use-monitoring-keep-awake';
import { createPairing, PairingApiError, resumeSession } from '@/pairing/api';
import { useMonitorSession } from '@/state/monitor-session';
import { hasFreshAccessToken } from '@/state/session-lifecycle';
import type { MonitorStatus } from '@/types/monitor';

export default function BabyScreen() {
  useMonitoringKeepAwake();
  const { session, isHydrated, setSession, clearSession } = useMonitorSession();
  const [status, setStatus] = useState<MonitorStatus>('requesting-permissions');
  const [parentCount, setParentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dimmed, setDimmed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isPrepared, setIsPrepared] = useState(false);
  const createRequestId = useRef(Crypto.randomUUID());
  const babySession = session?.role === 'baby' ? session : null;

  const handleRoomError = useCallback((message: string) => {
    setStatus('failed');
    setError(message);
  }, []);

  useEffect(() => {
    if (!isHydrated || isPrepared) return;
    let cancelled = false;

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

      const savedSession = session?.role === 'baby' ? session : null;
      if (session && !savedSession) clearSession();
      if (savedSession && hasFreshAccessToken(savedSession)) {
        setIsPrepared(true);
        return;
      }
      if (savedSession) {
        try {
          const recovered = await resumeSession(savedSession.recoveryToken);
          if (cancelled) return;
          if (recovered.role !== 'baby') throw new Error('The saved session belongs to the Parent Unit.');
          setSession(recovered);
          setIsPrepared(true);
          return;
        } catch (reason) {
          if (reason instanceof PairingApiError && reason.status === 410) clearSession();
          throw reason;
        }
      }

      const pairing = await createPairing(createRequestId.current);
      if (cancelled) return;
      setSession({
        role: 'baby',
        roomId: pairing.roomId,
        token: pairing.babyToken,
        tokenExpiresAt: pairing.tokenExpiresAt,
        livekitUrl: pairing.livekitUrl,
        encryptionKey: pairing.encryptionKey,
        expiresAt: pairing.expiresAt,
        sessionExpiresAt: pairing.sessionExpiresAt,
        recoveryToken: pairing.babyRecoveryToken,
        pairingCode: pairing.pairingCode,
      });
      setIsPrepared(true);
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
  }, [attempt, clearSession, isHydrated, isPrepared, session, setSession]);

  function stopMonitoring() {
    clearSession();
    router.replace('/');
  }

  if (error || !isPrepared || !babySession) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.setupSafe}>
        <View style={styles.setupHeader}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={stopMonitoring}
            style={({ pressed }) => [styles.setupBackButton, pressed && styles.pressed]}>
            <Text style={styles.setupBackIcon}>‹</Text>
          </Pressable>
          <Text style={styles.setupHeaderTitle}>Baby camera</Text>
          <View style={styles.setupHeaderSpacer} />
        </View>
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
                  setIsPrepared(false);
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
      <View style={StyleSheet.absoluteFill}>
        <BabyRoom
          session={babySession}
          onStatusChange={setStatus}
          onParentCountChange={setParentCount}
          onError={handleRoomError}
        />
      </View>

      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        style={styles.overlay}>
        <View style={styles.cameraHeader}>
          <Pressable
            accessibilityLabel="Stop monitoring and go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={stopMonitoring}
            style={({ pressed }) => [styles.cameraBackButton, pressed && styles.pressed]}>
            <Text style={styles.cameraBackIcon}>‹</Text>
          </Pressable>
          <ConnectionStatus
            compact
            status={status}
            label={status === 'connected' ? parentConnectionLabel(parentCount) : undefined}
          />
        </View>

        <View style={styles.bottomSheet}>
          {babySession.pairingCode ? (
            <PairingCode code={babySession.pairingCode} expiresAt={babySession.expiresAt} />
          ) : null}
          <View style={styles.controls}>
            <Pressable
              accessibilityHint="Hides the camera preview while monitoring continues"
              accessibilityRole="button"
              onPress={() => setDimmed(true)}
              style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
              <Text style={styles.controlIcon}>◐</Text>
              <Text style={styles.controlButtonText}>Dim screen</Text>
            </Pressable>
            <View style={styles.controlDivider} />
            <Pressable
              accessibilityRole="button"
              onPress={stopMonitoring}
              style={({ pressed }) => [styles.controlButton, styles.stopButton, pressed && styles.pressed]}>
              <View style={styles.stopIcon} />
              <Text style={[styles.controlButtonText, styles.stopButtonText]}>End</Text>
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
          <View style={styles.dimStatus}>
            <ConnectionStatus
              status={status}
              label={
                status === 'connected'
                  ? parentConnectionLabel(parentCount)
                  : undefined
              }
            />
          </View>
          <Text style={styles.dimTitle}>Monitoring</Text>
          <Text style={styles.dimHint}>Tap anywhere to restore screen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function parentConnectionLabel(parentCount: number) {
  if (parentCount === 0) return 'Waiting for parent';
  if (parentCount === 1) return '1 parent connected';
  return `${parentCount} parents connected`;
}

const styles = StyleSheet.create({
  container: { backgroundColor: palette.ink, flex: 1 },
  setupSafe: { backgroundColor: palette.canvas, flex: 1 },
  setupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: spacing.md,
  },
  setupBackButton: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  setupBackIcon: {
    color: palette.ink,
    fontSize: 37,
    fontWeight: '300',
    lineHeight: 39,
    marginLeft: -2,
    marginTop: -3,
  },
  setupHeaderTitle: { color: palette.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  setupHeaderSpacer: { width: 44 },
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
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    pointerEvents: 'box-none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cameraHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  cameraBackButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.94)',
    borderColor: 'rgba(255,255,255,0.84)',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: palette.black,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      web: { boxShadow: '0 3px 12px rgba(11,13,13,0.2)' },
    }),
  },
  cameraBackIcon: {
    color: palette.ink,
    fontSize: 38,
    fontWeight: '300',
    lineHeight: 41,
    marginLeft: -2,
    marginTop: -4,
  },
  bottomSheet: {
    backgroundColor: 'rgba(255,253,248,0.97)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    ...Platform.select({
      android: { elevation: 10 },
      ios: {
        shadowColor: palette.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      web: { boxShadow: '0 8px 24px rgba(11,13,13,0.2)' },
    }),
  },
  controls: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 8,
  },
  controlButton: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 44,
  },
  controlIcon: { color: palette.sageDark, fontSize: 19, fontWeight: '700' },
  controlButtonText: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  controlDivider: { backgroundColor: palette.line, height: 24, width: StyleSheet.hairlineWidth },
  stopButton: { flex: 0.62 },
  stopIcon: { backgroundColor: palette.red, borderRadius: 3, height: 10, width: 10 },
  stopButtonText: { color: palette.red },
  pressed: { opacity: 0.58 },
  dimStatus: { alignSelf: 'center' },
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
