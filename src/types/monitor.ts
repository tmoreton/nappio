export type MonitorStatus =
  | 'idle'
  | 'requesting-permissions'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export type MonitorRole = 'baby' | 'parent';

export type MonitorSession = {
  role: MonitorRole;
  roomId: string;
  token: string;
  livekitUrl: string;
  encryptionKey: string;
  expiresAt: string;
  pairingCode?: string;
};
