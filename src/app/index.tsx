import { Redirect, router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';
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

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>A PRIVATE LINK BETWEEN TWO PHONES</Text>
        <Text style={styles.title}>Rest easy. Stay close.</Text>
        <Text style={styles.subtitle}>
          Turn one phone into a secure baby camera and use the other to listen and watch.
        </Text>
      </View>

      <View style={styles.actions}>
        {isHydrated && session ? (
          <ActionButton
            label={isResuming ? 'Restoring…' : session.role === 'baby' ? 'Continue Baby Camera' : 'Continue Monitoring'}
            detail="Resume the last private session"
            icon={session.role === 'baby' ? 'camera' : 'monitor'}
            disabled={isResuming}
            onPress={() => void continueMonitoring()}
          />
        ) : null}
        <ActionButton
          label="Use as Baby Camera"
          detail="Share this phone’s camera and microphone"
          icon="camera"
          onPress={startBabyCamera}
        />
        <ActionButton
          label="Monitor Baby"
          detail="Connect with a code or scan a QR code"
          icon="monitor"
          variant="secondary"
          onPress={startParentMonitor}
        />
      </View>

      <View style={styles.privacy}>
        <View style={styles.privacyDot} />
        <Text style={styles.privacyText}>No recording or playback history is built into Nappio.</Text>
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
    justifyContent: 'space-between',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mark: {
    backgroundColor: palette.ink,
    borderRadius: 14,
    height: 40,
    overflow: 'hidden',
    width: 40,
  },
  markMoon: {
    backgroundColor: palette.canvas,
    borderRadius: 14,
    height: 25,
    left: 11,
    position: 'absolute',
    top: 5,
    width: 25,
  },
  markStar: {
    backgroundColor: palette.peach,
    borderRadius: 3,
    height: 6,
    left: 8,
    position: 'absolute',
    top: 25,
    transform: [{ rotate: '45deg' }],
    width: 6,
  },
  wordmark: {
    color: palette.ink,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  hero: {
    gap: spacing.md,
    marginVertical: spacing.xxl,
  },
  eyebrow: {
    color: palette.sageDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 54,
    fontWeight: '700',
    letterSpacing: -2.1,
    lineHeight: 58,
    maxWidth: 460,
  },
  subtitle: {
    color: palette.muted,
    fontSize: 18,
    lineHeight: 27,
    maxWidth: 520,
  },
  actions: {
    gap: spacing.md,
  },
  privacy: {
    alignItems: 'center',
    backgroundColor: palette.sageWash,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
  },
  privacyDot: {
    backgroundColor: palette.sageDark,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  privacyText: {
    color: palette.sageDark,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  footerLink: { color: palette.sageDark, fontSize: 12, fontWeight: '700' },
  footerDot: { color: palette.line, fontSize: 12 },
});
