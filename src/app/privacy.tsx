import { Stack } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';

const POLICY_URL = 'https://tmoreton.github.io/nappio/#privacy-policy';

const sections = [
  {
    title: 'What Nappio handles',
    body: 'Nappio uses the Baby Unit camera and microphone for live monitoring. A Parent Unit uses its microphone only while push-to-talk is held. Nappio does not create user accounts, build advertising profiles, or provide recording. Optional notifications report sound, interruptions, or Baby Unit power concerns while monitoring is active.',
  },
  {
    title: 'Pairing and session data',
    body: 'The Cloudflare pairing service temporarily stores a random pairing code, room identifier, end-to-end encryption key, hashed role-specific recovery credentials, and expiry times. Pairing codes expire after five minutes. Session records expire within 24 hours. Short-lived network address data is processed for abuse prevention.',
  },
  {
    title: 'Live audio and video',
    body: 'LiveKit relays encrypted audio and video between the phones in a room. Media is encrypted on the devices and Nappio does not enable server-side recording. Cloudflare and LiveKit may process connection metadata and operational logs under their own privacy and security practices.',
  },
  {
    title: 'Storage and deletion',
    body: 'The phone stores its recovery credential and current encryption material in iOS Keychain or Android Keystore so a session can survive an app restart. Ending monitoring removes the saved credential from that phone. Server session records are automatically removed at expiry.',
  },
  {
    title: 'Children and safety',
    body: 'Nappio is intended for use by adults and does not ask for a child profile or intentionally collect information directly from children. Nappio is not a medical device and is not a substitute for adult supervision.',
  },
];

export default function PrivacyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy' }} />
      <Screen edges={['bottom', 'left', 'right']} scroll contentStyle={styles.content}>
        <Text style={styles.eyebrow}>LAST UPDATED SEPTEMBER 8, 2026</Text>
        <Text style={styles.title}>Privacy, in plain language.</Text>
        <Text style={styles.intro}>
          Nappio is designed to make a temporary private room between phones with as little retained data as possible.
        </Text>
        <View style={styles.sections}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.body}>
          Nappio does not sell personal information or use third-party advertising analytics. For questions or privacy requests, email tmoreton89@gmail.com.
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(POLICY_URL)}
          style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
          <Text style={styles.linkText}>View the public privacy policy ↗</Text>
        </Pressable>
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
  sections: { gap: spacing.md, marginVertical: spacing.xl },
  section: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  body: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  linkButton: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
  },
  linkText: { color: palette.white, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
