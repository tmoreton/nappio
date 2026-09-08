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

const HEADER_SCREEN_EDGES = ['bottom', 'left', 'right'] as const;

export default function PairScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const { setSession } = useMonitorSession();
  const incomingCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [code, setCode] = useState(() => normalizePairingCode(incomingCode ?? ''));
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const inputRef = useRef<TextInput>(null);
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen contentStyle={styles.content} edges={HEADER_SCREEN_EDGES} scroll>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>CONNECT PRIVATELY</Text>
          <Text style={styles.title}>Choose how to connect</Text>
          <Text style={styles.copy}>Use the one-time code or QR code shown on the baby camera.</Text>
        </View>

        <View accessibilityRole="tablist" style={styles.methodPicker}>
          <Pressable
            accessibilityLabel="Enter a six-digit code"
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            onPress={() => inputRef.current?.focus()}
            style={({ pressed }) => [styles.method, styles.methodActive, pressed && styles.pressed]}>
            <Text style={[styles.methodLabel, styles.methodLabelActive]}>Enter code</Text>
            <Text style={[styles.methodDetail, styles.methodDetailActive]}>6 digits</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Scan a pairing QR code"
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            onPress={() => void openScanner()}
            style={({ pressed }) => [styles.method, pressed && styles.pressed]}>
            <Text style={styles.methodLabel}>Scan QR</Text>
            <Text style={styles.methodDetail}>Use camera</Text>
          </Pressable>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.label}>SIX-DIGIT CODE</Text>
          <TextInput
            ref={inputRef}
            accessibilityLabel="Six-digit pairing code"
            autoComplete="one-time-code"
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
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { backgroundColor: palette.canvas, flex: 1 },
  content: { paddingBottom: spacing.lg, paddingTop: 12 },
  intro: { gap: 6, marginBottom: 20 },
  eyebrow: { color: palette.sageDark, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 37,
  },
  copy: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  methodPicker: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    padding: 6,
  },
  method: {
    borderRadius: 13,
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 12,
  },
  methodActive: { backgroundColor: palette.ink },
  methodLabel: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  methodLabelActive: { color: palette.white },
  methodDetail: { color: palette.muted, fontSize: 12, marginTop: 2 },
  methodDetailActive: { color: palette.sageWash },
  pressed: { opacity: 0.76 },
  codeCard: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 12,
    padding: 20,
  },
  label: { color: palette.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  input: {
    color: palette.ink,
    fontFamily: type.mono,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 9,
    marginTop: 4,
    minHeight: 56,
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
