import * as Linking from 'expo-linking';

export function normalizePairingCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function pairingDeepLink(pairingCode: string) {
  return Linking.createURL('/parent/pair', { queryParams: { code: pairingCode } });
}

export function pairingCodeFromQr(data: string) {
  const parsed = Linking.parse(data);
  const value = parsed.queryParams?.code;
  const code = normalizePairingCode(Array.isArray(value) ? value[0] : String(value ?? ''));
  return code.length === 6 ? code : null;
}
