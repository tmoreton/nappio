import { Stack } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';

const POLICY_URL = 'https://napnear.com/#privacy-policy';

const sections = [
  {
    title: 'What NapNear handles',
    body: 'NapNear uses the Baby Unit camera and microphone for live monitoring. A Parent Unit uses its microphone only while push-to-talk is held. NapNear does not create user accounts, build advertising profiles, or provide recording. Optional notifications report sound, interruptions, or Baby Unit power concerns while monitoring is active.',
  },
  {
    title: 'Pairing and session data',
    body: 'The Cloudflare pairing service temporarily stores a random pairing code, room identifier, hashed role-specific recovery credentials, single-use signaling tickets, and expiry times. Pairing codes expire after five minutes. Active session records renew for up to 30 days at a time and are deleted when they expire. A random installation identifier and network address are processed only to prevent abuse.',
  },
  {
    title: 'Live audio and video',
    body: 'WebRTC sends encrypted audio and video directly between the phones whenever possible. If a direct path is blocked, Cloudflare TURN forwards the encrypted packets. NapNear does not provide server-side recording. To operate and budget the service, NapNear records whether a Parent connection was direct or relayed and gives TURN a one-way room identifier. Cloudflare may process connection metadata and operational logs under its privacy and security practices.',
  },
  {
    title: 'Storage and deletion',
    body: 'The phone stores its recovery credential and random installation identifier in iOS Keychain or Android Keystore. The identifier is not an Apple advertising identifier and is not used for tracking. Ending a room removes the saved credential and requests immediate server deletion; otherwise server session records are automatically removed at expiry.',
  },
  {
    title: 'Children and safety',
    body: 'NapNear is intended for use by adults and does not ask for a child profile or intentionally collect information directly from children. NapNear is not a medical device and is not a substitute for adult supervision.',
  },
];

export default function PrivacyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy' }} />
      <Screen edges={['bottom', 'left', 'right']} scroll contentStyle={styles.content}>
        <Text style={styles.eyebrow}>LAST UPDATED SEPTEMBER 9, 2026</Text>
        <Text style={styles.title}>Privacy, in plain language.</Text>
        <Text style={styles.intro}>
          NapNear is designed to make a temporary private room between phones with as little retained data as possible.
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
          NapNear does not sell personal information or use third-party advertising analytics. For questions or privacy requests, email tmoreton89@gmail.com.
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
