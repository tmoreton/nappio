import * as Crypto from 'expo-crypto';

const clientId = Crypto.randomUUID();

export async function getClientId() {
  return clientId;
}
