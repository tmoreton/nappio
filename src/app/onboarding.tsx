import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { BrandMark } from '@/components/brand-mark';
import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';
import { markOnboardingComplete } from '@/state/onboarding-storage';

type OnboardingDestination = '/' | '/baby' | '/parent/pair';

export default function OnboardingScreen() {
  const [destination, setDestination] = useState<OnboardingDestination | null>(null);

  async function finishOnboarding(nextDestination: OnboardingDestination) {
    if (destination) return;
    setDestination(nextDestination);
    try {
      await markOnboardingComplete();
    } catch (error) {
      console.warn('Could not save onboarding completion.', error);
    } finally {
      router.replace(nextDestination);
    }
  }

  return (
    <Screen contentStyle={styles.content} scroll>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <BrandMark size={32} />
          <Text style={styles.wordmark}>Nappio</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(destination)}
          hitSlop={8}
          onPress={() => void finishOnboarding('/')}
          style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}>
          <Text style={styles.laterText}>Choose later</Text>
        </Pressable>
      </View>

      <View style={styles.main}>
        <View style={styles.welcomeVisual}>
          <BrandMark size={92} />
        </View>
        <Text style={styles.eyebrow}>PRIVATE MULTI-DEVICE MONITORING</Text>
        <Text accessibilityRole="header" style={styles.title}>
          What will this device do?
        </Text>
        <Text style={styles.body}>
          Choose a role now. Nappio will ask only for the permissions that role needs.
        </Text>

        <View style={styles.actions}>
          <ActionButton
            compact
            disabled={Boolean(destination)}
            detail="Camera and microphone stay on this device"
            icon="camera"
            label={destination === '/baby' ? 'Opening baby camera…' : 'Baby camera'}
            onPress={() => void finishOnboarding('/baby')}
          />
          <ActionButton
            compact
            disabled={Boolean(destination)}
            detail="Watch, listen, and receive optional alerts"
            icon="monitor"
            label={destination === '/parent/pair' ? 'Opening parent monitor…' : 'Parent monitor'}
            onPress={() => void finishOnboarding('/parent/pair')}
            variant="secondary"
          />
        </View>

        <View style={styles.privacyPill}>
          <View style={styles.privacyDot} />
          <Text style={styles.privacyText}>Encrypted · No account · Nothing is recorded</Text>
        </View>
      </View>

      <Text style={styles.safety}>
        Nappio is not a medical device or a replacement for direct adult supervision.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.lg, paddingTop: spacing.sm },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  brand: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  wordmark: { color: palette.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  laterButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  laterText: { color: palette.sageDark, fontSize: 14, fontWeight: '700' },
  main: { marginTop: 'auto', paddingVertical: spacing.xl },
  welcomeVisual: { marginBottom: spacing.xl },
  eyebrow: { color: palette.sageDark, fontSize: 10, fontWeight: '800', letterSpacing: 1.35 },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1.2,
    lineHeight: 46,
    marginTop: spacing.sm,
  },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 12 },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  privacyPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: palette.sageWash,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  privacyDot: { backgroundColor: palette.sageDark, borderRadius: 4, height: 8, width: 8 },
  privacyText: { color: palette.sageDark, fontSize: 11, fontWeight: '800' },
  safety: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 'auto',
    textAlign: 'center',
  },
  pressed: { opacity: 0.64 },
});
