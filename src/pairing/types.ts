export type CreatePairingResponse = {
  pairingCode: string;
  roomId: string;
  babyToken: string;
  tokenExpiresAt: string;
  livekitUrl: string;
  encryptionKey: string;
  expiresAt: string;
  sessionExpiresAt: string;
  babyRecoveryToken: string;
};

export type JoinPairingResponse = {
  roomId: string;
  parentToken: string;
  tokenExpiresAt: string;
  livekitUrl: string;
  encryptionKey: string;
  expiresAt: string;
  sessionExpiresAt: string;
  parentRecoveryToken: string;
};

export type ResumeSessionResponse = {
  role: 'baby' | 'parent';
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
