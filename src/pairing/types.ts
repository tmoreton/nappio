export type CreatePairingResponse = {
  pairingCode: string;
  roomId: string;
  expiresAt: string;
  sessionExpiresAt: string;
  babyRecoveryToken: string;
};

export type JoinPairingResponse = {
  roomId: string;
  expiresAt: string;
  sessionExpiresAt: string;
  parentRecoveryToken: string;
};

export type ResumeSessionResponse = {
  role: 'baby' | 'parent';
  roomId: string;
  expiresAt: string;
  sessionExpiresAt: string;
  recoveryToken: string;
  pairingCode?: string;
};

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type SignalTicketResponse = {
  ticket: string;
  roomId: string;
  role: 'baby' | 'parent';
  expiresAt: string;
  signalingUrl: string;
  iceServers: IceServer[];
};
