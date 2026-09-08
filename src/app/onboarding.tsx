import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';
import { markOnboardingComplete } from '@/state/onboarding-storage';

const pages = [
  {
    eyebrow: 'WELCOME TO NAPPIO',
    title: 'Two phones. One private monitor.',
    body: 'Use one phone as the Baby Unit and keep the other with you. Nappio creates a private live link with no account required.',
  },
  {
    eyebrow: 'SIMPLE SETUP',
    title: 'Ready in three small steps.',
    body: 'Choose a role on each phone, then scan the QR code or enter six digits. Permissions are requested only when a feature needs them.',
  },
  {
    eyebrow: 'BUILT FOR REAL LIFE',
    title: 'Calm checks, with clear limits.',
    body: 'Keep the Baby Unit plugged in and test your setup before relying on it. Nappio is not a medical device or a replacement for adult supervision.',
  },
] as const;

function WelcomeVisual() {
  return (
    <View style={[styles.visual, styles.welcomeVisual]} accessibilityElementsHidden>
      <Image
        contentFit="contain"
        source={require('../../assets/images/icon.png')}
        style={styles.appIcon}
      />
      <View style={styles.privatePill}>
        <View style={styles.privateDot} />
        <Text style={styles.privateText}>Private by design</Text>
      </View>
    </View>
  );
}

function PhoneCard({ dark, label, role }: { dark?: boolean; label: string; role: string }) {
  return (
    <View style={[styles.phone, dark && styles.phoneDark]}>
      <View style={[styles.phoneNotch, dark && styles.phoneNotchDark]} />
      <View style={[styles.roleIcon, dark && styles.roleIconDark]}>
        <Text style={[styles.roleIconText, dark && styles.roleIconTextDark]}>{dark ? '◉' : '●'}</Text>
      </View>
      <Text style={[styles.phoneRole, dark && styles.phoneTextDark]}>{role}</Text>
      <Text style={[styles.phoneLabel, dark && styles.phoneLabelDark]}>{label}</Text>
    </View>
  );
}

function SetupVisual() {
  return (
    <View
      accessibilityLabel="Use one phone as the Baby Unit, pair privately, then monitor from the second phone"
      accessible
      style={[styles.visual, styles.setupVisual]}>
      <PhoneCard label="Camera + mic" role="Baby Unit" />
      <View style={styles.connection}>
        <Text style={styles.connectionDots}>•••</Text>
        <View style={styles.codePill}>
          <Text style={styles.codeText}>482 193</Text>
        </View>
      </View>
      <PhoneCard dark label="Watch + listen" role="Parent" />
    </View>
  );
}

const assurances = [
  ['◇', 'Encrypted media', 'Audio and video are encrypted between the phones.'],
  ['♪', 'Audio-only mode', 'Keep listening while the Parent phone is locked.'],
  ['!', 'Optional alerts', 'Choose whether to be warned about sound or a lost connection.'],
] as const;

function TrustVisual() {
  return (
    <View style={[styles.visual, styles.trustVisual]}>
      {assurances.map(([icon, title, detail]) => (
        <View key={title} style={styles.assuranceRow}>
          <View style={styles.assuranceIcon}>
            <Text style={styles.assuranceIconText}>{icon}</Text>
          </View>
          <View style={styles.assuranceCopy}>
            <Text style={styles.assuranceTitle}>{title}</Text>
            <Text style={styles.assuranceDetail}>{detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function OnboardingVisual({ page }: { page: number }) {
  if (page === 0) return <WelcomeVisual />;
  if (page === 1) return <SetupVisual />;
  return <TrustVisual />;
}

export default function OnboardingScreen() {
  const [page, setPage] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const current = pages[page]!;
  const isLastPage = page === pages.length - 1;

  async function finishOnboarding() {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await markOnboardingComplete();
    } catch (error) {
      console.warn('Could not save onboarding completion.', error);
    } finally {
      router.replace('/');
    }
  }

  function continueOnboarding() {
    if (isLastPage) {
      void finishOnboarding();
      return;
    }
    setPage((value) => Math.min(value + 1, pages.length - 1));
  }

  return (
    <Screen contentStyle={styles.content} scroll>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandDot} />
          <Text style={styles.wordmark}>Nappio</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isFinishing}
          hitSlop={8}
          onPress={() => void finishOnboarding()}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <OnboardingVisual page={page} />

      <View accessibilityLiveRegion="polite" style={styles.copy}>
        <Text style={styles.eyebrow}>{current.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {current.title}
        </Text>
        <Text style={styles.body}>{current.body}</Text>
      </View>

      <View style={styles.footer}>
        <View accessibilityLabel={`Page ${page + 1} of ${pages.length}`} style={styles.progress}>
          {pages.map((item, index) => (
            <View
              key={item.eyebrow}
              style={[styles.progressDot, index === page && styles.progressDotActive]}
            />
          ))}
        </View>
        <View style={styles.actions}>
          {page > 0 ? (
            <Pressable
              accessibilityRole="button"
              disabled={isFinishing}
              onPress={() => setPage((value) => Math.max(value - 1, 0))}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={isFinishing}
            onPress={continueOnboarding}
            style={({ pressed }) => [
              styles.continueButton,
              page === 0 && styles.continueButtonFull,
              (pressed || isFinishing) && styles.pressed,
            ]}>
            <Text style={styles.continueText}>
              {isFinishing ? 'Opening…' : isLastPage ? 'Choose a role' : 'Continue'}
            </Text>
            <Text style={styles.continueArrow}>›</Text>
          </Pressable>
        </View>
      </View>
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
  brandDot: { backgroundColor: palette.peach, borderRadius: 5, height: 9, width: 9 },
  wordmark: { color: palette.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
  skipButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  skipText: { color: palette.sageDark, fontSize: 14, fontWeight: '700' },
  visual: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: radii.lg,
    justifyContent: 'center',
    marginTop: spacing.md,
    maxWidth: 480,
    minHeight: 250,
    overflow: 'hidden',
    width: '100%',
  },
  welcomeVisual: { backgroundColor: palette.paper, borderColor: palette.line, borderWidth: 1 },
  appIcon: { height: 210, marginTop: -18, width: 210 },
  privatePill: {
    alignItems: 'center',
    backgroundColor: palette.sageWash,
    borderRadius: radii.pill,
    bottom: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 13,
    paddingVertical: 9,
    position: 'absolute',
  },
  privateDot: { backgroundColor: palette.sageDark, borderRadius: 4, height: 8, width: 8 },
  privateText: { color: palette.sageDark, fontSize: 12, fontWeight: '800' },
  setupVisual: { backgroundColor: palette.sageWash, flexDirection: 'row', padding: spacing.md },
  phone: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderColor: palette.ink,
    borderRadius: 22,
    borderWidth: 2,
    height: 182,
    justifyContent: 'center',
    padding: spacing.sm,
    width: 105,
  },
  phoneDark: { backgroundColor: palette.ink },
  phoneNotch: {
    backgroundColor: palette.ink,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    height: 7,
    position: 'absolute',
    top: 0,
    width: 40,
  },
  phoneNotchDark: { backgroundColor: palette.black },
  roleIcon: {
    alignItems: 'center',
    backgroundColor: palette.peachWash,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  roleIconDark: { backgroundColor: palette.sage },
  roleIconText: { color: palette.peach, fontSize: 16, fontWeight: '800' },
  roleIconTextDark: { color: palette.ink },
  phoneRole: { color: palette.ink, fontSize: 13, fontWeight: '800', marginTop: 14 },
  phoneTextDark: { color: palette.white },
  phoneLabel: { color: palette.muted, fontSize: 9, marginTop: 3, textAlign: 'center' },
  phoneLabelDark: { color: palette.sage },
  connection: { alignItems: 'center', marginHorizontal: -2, width: 72, zIndex: 1 },
  connectionDots: { color: palette.sageDark, fontSize: 17, letterSpacing: 2 },
  codePill: {
    backgroundColor: palette.white,
    borderColor: palette.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  codeText: { color: palette.ink, fontFamily: type.mono, fontSize: 9, fontWeight: '800' },
  trustVisual: {
    alignItems: 'stretch',
    backgroundColor: palette.ink,
    gap: 1,
    padding: spacing.md,
  },
  assuranceRow: {
    alignItems: 'center',
    backgroundColor: '#2D3C39',
    flexDirection: 'row',
    gap: 13,
    padding: 14,
  },
  assuranceIcon: {
    alignItems: 'center',
    backgroundColor: palette.sage,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  assuranceIconText: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  assuranceCopy: { flex: 1 },
  assuranceTitle: { color: palette.white, fontSize: 13, fontWeight: '800' },
  assuranceDetail: { color: palette.sage, fontSize: 10, lineHeight: 14, marginTop: 2 },
  copy: { marginTop: spacing.xl },
  eyebrow: { color: palette.sageDark, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1.3,
    lineHeight: 44,
    marginTop: spacing.sm,
  },
  body: { color: palette.muted, fontSize: 15, lineHeight: 23, marginTop: spacing.md },
  footer: { marginTop: spacing.xl },
  progress: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center' },
  progressDot: { backgroundColor: palette.line, borderRadius: 4, height: 7, width: 7 },
  progressDotActive: { backgroundColor: palette.ink, width: 24 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  backButton: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: spacing.lg,
  },
  backText: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  continueButton: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: radii.md,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: spacing.md,
  },
  continueButtonFull: { flex: 1 },
  continueText: { color: palette.white, fontSize: 15, fontWeight: '800' },
  continueArrow: { color: palette.white, fontSize: 26, marginLeft: spacing.sm, marginTop: -2 },
  pressed: { opacity: 0.68 },
});
