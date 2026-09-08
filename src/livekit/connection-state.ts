import { ConnectionState } from 'livekit-client';

import type { MonitorStatus } from '@/types/monitor';

export function connectionStateToMonitorStatus(state: ConnectionState): MonitorStatus {
  switch (state) {
    case ConnectionState.Connecting:
      return 'connecting';
    case ConnectionState.Connected:
      return 'connected';
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return 'reconnecting';
    case ConnectionState.Disconnected:
    default:
      return 'disconnected';
  }
}
