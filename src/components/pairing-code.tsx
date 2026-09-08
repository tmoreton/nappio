import QRCode from 'react-native-qrcode-svg';
import { StyleSheet, Text, View } from 'react-native';

import { palette, radii, spacing, type } from '@/constants/design';
import { pairingDeepLink } from '@/pairing/code';

export function PairingCode({ code, expiresAt }: { code: string; expiresAt: string }) {
  const expiration = new Date(expiresAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>PAIRING CODE</Text>
        <Text selectable style={styles.code} accessibilityLabel={`Pairing code ${code}`}>
          {code.slice(0, 3)} {code.slice(3)}
        </Text>
        <Text style={styles.note}>Single use · expires at {expiration}</Text>
      </View>
      <View style={styles.qr}>
        <QRCode
          value={pairingDeepLink(code)}
          size={98}
          color={palette.ink}
          backgroundColor={palette.white}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  copy: { flex: 1 },
  eyebrow: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  code: {
    color: palette.ink,
    fontFamily: type.mono,
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: 2,
    marginVertical: 5,
  },
  note: { color: palette.muted, fontSize: 11 },
  qr: { backgroundColor: palette.white, borderRadius: radii.sm, padding: 7 },
});
