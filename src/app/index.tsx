import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';

export default function HomeScreen() {
  return (
    <Screen contentStyle={styles.content}>
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
        <ActionButton
          label="Use as Baby Camera"
          detail="Share this phone’s camera and microphone"
          icon="camera"
          onPress={() => router.push('/baby')}
        />
        <ActionButton
          label="Monitor Baby"
          detail="Connect with a code or scan a QR code"
          icon="monitor"
          variant="secondary"
          onPress={() => router.push('/parent/pair')}
        />
      </View>

      <View style={styles.privacy}>
        <View style={styles.privacyDot} />
        <Text style={styles.privacyText}>No recording or playback history is built into Nappio.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
