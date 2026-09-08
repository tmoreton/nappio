import { Redirect, router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Screen } from '@/components/screen';
import { palette, spacing, type } from '@/constants/design';
import { resumeSession } from '@/pairing/api';
import { useMonitorSession } from '@/state/monitor-session';
import { hasCompletedOnboarding } from '@/state/onboarding-storage';

export default function HomeScreen() {
  const { session, isHydrated, setSession, clearSession } = useMonitorSession();
  const [isResuming, setIsResuming] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasCompletedOnboarding()
      .then((complete) => {
        if (!cancelled) setOnboardingComplete(complete);
      })
      .catch((error: unknown) => {
        console.warn('Could not check onboarding status.', error);
        if (!cancelled) setOnboardingComplete(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function continueMonitoring() {
    if (!session || isResuming) return;
    setIsResuming(true);
    try {
      const recovered = await resumeSession(session.recoveryToken);
      setSession(recovered);
      router.push(recovered.role === 'baby' ? '/baby' : '/parent/monitor');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The saved session could not be restored.';
      Alert.alert('Could not continue', message, [
        { text: 'Keep for retry', style: 'cancel' },
        { text: 'Remove session', style: 'destructive', onPress: clearSession },
      ]);
    } finally {
      setIsResuming(false);
    }
  }

  function startBabyCamera() {
    clearSession();
    router.push('/baby');
  }

  function startParentMonitor() {
    clearSession();
    router.push('/parent/pair');
  }

  if (onboardingComplete === null) {
    return <View style={styles.loading} />;
  }

  if (!onboardingComplete) {
    return <Redirect href={'/onboarding' as Href} />;
  }

  return (
    <Screen contentStyle={styles.content} scroll>
      <View style={styles.brand}>
        <View style={styles.mark} accessibilityElementsHidden>
          <View style={styles.markMoon} />
          <View style={styles.markStar} />
        </View>
        <Text style={styles.wordmark}>Nappio</Text>
      </View>

      <View style={styles.main}>
        <View style={styles.hero}>
          <Text style={styles.title}>Choose a role.</Text>
          <Text style={styles.subtitle}>How would you like to use this phone?</Text>
        </View>

        <View style={styles.actions}>
          {isHydrated && session ? (
            <ActionButton
              compact
              label={
                isResuming
                  ? 'Restoring…'
                  : session.role === 'baby'
                    ? 'Resume baby camera'
                    : 'Resume monitoring'
              }
              icon={session.role === 'baby' ? 'camera' : 'monitor'}
              disabled={isResuming}
              onPress={() => void continueMonitoring()}
            />
          ) : null}
          <ActionButton
            compact
            label="Baby camera"
            icon="camera"
            onPress={startBabyCamera}
          />
          <ActionButton
            compact
            label="Parent monitor"
            icon="monitor"
            variant="secondary"
            onPress={startParentMonitor}
          />
        </View>

        <View style={styles.privacy}>
          <View style={styles.privacyDot} />
          <Text style={styles.privacyText}>Private connection · Nothing is recorded</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/privacy' as Href)}>
          <Text style={styles.footerLink}>Privacy</Text>
        </Pressable>
        <Text style={styles.footerDot}>•</Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/support' as Href)}>
          <Text style={styles.footerLink}>Help & support</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { backgroundColor: palette.canvas, flex: 1 },
  content: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mark: {
    backgroundColor: palette.ink,
    borderRadius: 14,
    height: 36,
    overflow: 'hidden',
    width: 36,
  },
  markMoon: {
    backgroundColor: palette.canvas,
    borderRadius: 13,
    height: 23,
    left: 10,
    position: 'absolute',
    top: 4,
    width: 23,
  },
  markStar: {
    backgroundColor: palette.peach,
    borderRadius: 3,
    height: 6,
    left: 7,
    position: 'absolute',
    top: 23,
    transform: [{ rotate: '45deg' }],
    width: 6,
  },
  wordmark: {
    color: palette.ink,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  main: { marginTop: spacing.xxl },
  hero: { gap: spacing.sm },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.5,
    lineHeight: 48,
    maxWidth: 460,
  },
  subtitle: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 520,
  },
  actions: {
    gap: 12,
    marginTop: spacing.xl,
  },
  privacy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  privacyDot: {
    backgroundColor: palette.sageDark,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  privacyText: {
    color: palette.sageDark,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
  },
  footerLink: { color: palette.sageDark, fontSize: 12, fontWeight: '700' },
  footerDot: { color: palette.line, fontSize: 12 },
});
