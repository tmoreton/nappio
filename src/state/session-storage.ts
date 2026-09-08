import type { MonitorSession } from '@/types/monitor';

export async function loadStoredSession(): Promise<MonitorSession | null> {
  return null;
}

export async function saveStoredSession(_session: MonitorSession): Promise<void> {}

export async function deleteStoredSession(): Promise<void> {}
