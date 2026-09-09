import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CLIENT_ID_KEY = 'nappio.client-id.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pendingClientId: Promise<string> | null = null;

export function getClientId() {
  if (pendingClientId) return pendingClientId;
  pendingClientId = (async () => {
    const stored = await SecureStore.getItemAsync(CLIENT_ID_KEY);
    if (stored && UUID_PATTERN.test(stored)) return stored;
    const created = Crypto.randomUUID();
    await SecureStore.setItemAsync(CLIENT_ID_KEY, created, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return created;
  })().catch((error: unknown) => {
    console.warn('Could not persist the local abuse-prevention identifier.', error);
    return Crypto.randomUUID();
  });
  return pendingClientId;
}
