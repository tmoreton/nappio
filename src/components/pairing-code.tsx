import QRCode from 'react-native-qrcode-svg';
import { StyleSheet, Text, View } from 'react-native';

import { palette, radii, type } from '@/constants/design';
import { pairingDeepLink } from '@/pairing/code';

export function PairingCode({ code, expiresAt }: { code: string; expiresAt: string }) {
  const expiration = new Date(expiresAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>CONNECT PARENT PHONE</Text>
        <Text selectable style={styles.code} accessibilityLabel={`Pairing code ${code}`}>
          {code.slice(0, 3)} {code.slice(3)}
        </Text>
        <Text numberOfLines={1} style={styles.note}>
          Expires {expiration} · one use
        </Text>
      </View>
      <View style={styles.qr}>
        <QRCode
          value={pairingDeepLink(code)}
          size={80}
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
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  copy: { flex: 1 },
  eyebrow: { color: palette.sageDark, fontSize: 9, fontWeight: '800', letterSpacing: 1.15 },
  code: {
    color: palette.ink,
    fontFamily: type.mono,
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 3,
    marginTop: 4,
  },
  note: { color: palette.muted, fontSize: 10 },
  qr: {
    backgroundColor: palette.white,
    borderColor: palette.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
  },
});
