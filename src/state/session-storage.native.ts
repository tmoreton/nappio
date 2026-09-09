import * as SecureStore from 'expo-secure-store';

import type { MonitorSession } from '@/types/monitor';

const SESSION_KEY = 'nappio.monitor-session.v2';

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isMonitorSession(value: unknown): value is MonitorSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<MonitorSession>;
  return (
    (session.role === 'baby' || session.role === 'parent') &&
    isString(session.roomId) &&
    isString(session.expiresAt) &&
    isString(session.sessionExpiresAt) &&
    isString(session.recoveryToken) &&
    Date.parse(session.sessionExpiresAt) > Date.now()
  );
}

export async function loadStoredSession(): Promise<MonitorSession | null> {
  const stored = await SecureStore.getItemAsync(SESSION_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isMonitorSession(parsed)) return parsed;
  } catch {
    // Invalid or outdated session data is removed below.
  }
  await deleteStoredSession();
  return null;
}

export async function saveStoredSession(session: MonitorSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function deleteStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
