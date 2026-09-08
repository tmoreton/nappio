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
  tokenExpiresAt: string;
  livekitUrl: string;
  encryptionKey: string;
  expiresAt: string;
  sessionExpiresAt: string;
  recoveryToken: string;
  pairingCode?: string;
};
