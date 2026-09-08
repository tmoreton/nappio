import type { MonitorSession } from '@/types/monitor';

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function hasFreshAccessToken(session: MonitorSession) {
  return Date.parse(session.tokenExpiresAt) > Date.now() + REFRESH_BUFFER_MS;
}
