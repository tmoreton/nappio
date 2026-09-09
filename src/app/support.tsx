import { router, Stack, type Href } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';

const troubleshooting = [
  'Keep both phones online and leave the Baby Unit connected to power for long sessions.',
  'If a code expires, end the Baby Unit session and start it again for a new code.',
  'Allow camera and microphone access on the Baby Unit. Allow notifications and notification sounds on the Parent Unit for sound and interruption alerts.',
  'If audio stops after locking the Parent phone, reopen Nappio and confirm that Monitoring live is visible before locking again.',
];

export default function SupportScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Help & support' }} />
      <Screen edges={['bottom', 'left', 'right']} scroll contentStyle={styles.content}>
        <Text style={styles.eyebrow}>NAPPIO SUPPORT</Text>
        <Text style={styles.title}>Let’s get monitoring working.</Text>
        <Text style={styles.intro}>
          Most connection problems are resolved by confirming permissions, connectivity, and an active room code.
        </Text>
        <View style={styles.card}>
          {troubleshooting.map((item, index) => (
            <View key={item} style={styles.step}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.body}>{item}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.safety}>
          Nappio is not a medical device. Always use direct adult supervision and never rely on a phone connection as the only safety measure.
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/onboarding' as Href)}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>View the welcome guide</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL('mailto:tmoreton89@gmail.com?subject=Nappio%20support')}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Email support</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL('https://github.com/tmoreton/nappio/issues/new')}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Report a technical issue ↗</Text>
          </Pressable>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  eyebrow: { color: palette.sageDark, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 43,
    marginTop: spacing.sm,
  },
  intro: { color: palette.muted, fontSize: 16, lineHeight: 24, marginTop: spacing.md },
  card: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  step: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  stepNumber: {
    backgroundColor: palette.sageWash,
    borderRadius: 14,
    color: palette.sageDark,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  body: { color: palette.muted, flex: 1, fontSize: 14, lineHeight: 21 },
  safety: {
    backgroundColor: palette.yellowWash,
    borderRadius: radii.md,
    color: palette.ink,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  primary: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    paddingVertical: 15,
  },
  primaryText: { color: palette.white, fontSize: 14, fontWeight: '800' },
  secondary: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: 15,
  },
  secondaryText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
