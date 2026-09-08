import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Screen } from '@/components/screen';
import { palette, radii, spacing, type } from '@/constants/design';
import { normalizePairingCode, pairingCodeFromQr } from '@/pairing/code';
import { joinPairing } from '@/pairing/api';
import { useMonitorSession } from '@/state/monitor-session';

export default function PairScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const { setSession } = useMonitorSession();
  const incomingCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [code, setCode] = useState(() => normalizePairingCode(incomingCode ?? ''));
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const submitting = useRef(false);

  async function joinWithCode(value: string) {
    const normalized = normalizePairingCode(value);
    if (normalized.length !== 6 || submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const pairing = await joinPairing(normalized);
      setSession({
        role: 'parent',
        roomId: pairing.roomId,
        token: pairing.parentToken,
        livekitUrl: pairing.livekitUrl,
        encryptionKey: pairing.encryptionKey,
        expiresAt: pairing.expiresAt,
      });
      router.replace('/parent/monitor');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not join the baby camera.');
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  async function openScanner() {
    setError(null);
    const currentPermission = permission?.granted ? permission : await requestPermission();
    if (!currentPermission.granted) {
      setError('Camera access is needed to scan the pairing QR code. You can still type the code.');
      return;
    }
    setScanning(true);
  }

  if (scanning) {
    return (
      <View style={styles.scannerScreen}>
        <CameraView
          active
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            const scannedCode = pairingCodeFromQr(data);
            if (!scannedCode) {
              setError('That QR code is not a Nappio pairing code.');
              return;
            }
            setScanning(false);
            setCode(scannedCode);
            void joinWithCode(scannedCode);
          }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.scannerShade} pointerEvents="none">
          <Text style={styles.scannerTitle}>Point at the QR code</Text>
          <View style={styles.scanFrame} />
          <Text style={styles.scannerHint}>Shown on the Baby Unit</Text>
        </View>
        <Pressable style={styles.scannerCancel} onPress={() => setScanning(false)}>
          <Text style={styles.scannerCancelText}>Enter code instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
      style={styles.flex}>
      <Screen contentStyle={styles.content} scroll>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>CONNECT PRIVATELY</Text>
          <Text style={styles.title}>Enter the code shown on the baby camera.</Text>
          <Text style={styles.copy}>Codes expire after five minutes and work only once.</Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.label}>SIX-DIGIT CODE</Text>
          <TextInput
            accessibilityLabel="Six-digit pairing code"
            autoComplete="one-time-code"
            autoFocus
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => {
              setCode(normalizePairingCode(value));
              setError(null);
            }}
            onSubmitEditing={() => void joinWithCode(code)}
            placeholder="000000"
            placeholderTextColor={palette.line}
            returnKeyType="done"
            style={styles.input}
            value={code}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <ActionButton
            label={isSubmitting ? 'Connecting…' : 'Start Monitoring'}
            detail="Join the encrypted live room"
            icon="monitor"
            disabled={code.length !== 6 || isSubmitting}
            onPress={() => void joinWithCode(code)}
          />
          <ActionButton
            label="Scan QR Code"
            detail="Use this phone’s camera to connect"
            icon="camera"
            variant="secondary"
            onPress={() => void openScanner()}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { backgroundColor: palette.canvas, flex: 1 },
  content: { paddingBottom: spacing.xl, paddingTop: spacing.lg },
  intro: { gap: spacing.sm, marginBottom: spacing.xl, marginTop: spacing.md },
  eyebrow: { color: palette.sageDark, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.2,
    lineHeight: 43,
  },
  copy: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  codeCard: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  label: { color: palette.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  input: {
    color: palette.ink,
    fontFamily: type.mono,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 11,
    marginTop: spacing.sm,
    minHeight: 62,
  },
  error: { color: palette.red, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  actions: { gap: spacing.sm },
  scannerScreen: { backgroundColor: palette.black, flex: 1 },
  scannerShade: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  scannerTitle: { color: palette.white, fontSize: 22, fontWeight: '800', marginBottom: spacing.lg },
  scanFrame: {
    borderColor: palette.white,
    borderRadius: radii.lg,
    borderWidth: 3,
    height: 250,
    width: 250,
  },
  scannerHint: { color: palette.white, fontSize: 14, marginTop: spacing.lg },
  scannerCancel: {
    alignSelf: 'center',
    backgroundColor: palette.paper,
    borderRadius: radii.pill,
    bottom: 54,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    position: 'absolute',
  },
  scannerCancelText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
});
