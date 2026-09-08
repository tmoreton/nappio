export type CreatePairingResponse = {
  pairingCode: string;
  roomId: string;
  babyToken: string;
  livekitUrl: string;
  encryptionKey: string;
  expiresAt: string;
};

export type JoinPairingResponse = {
  roomId: string;
  parentToken: string;
  livekitUrl: string;
  encryptionKey: string;
  expiresAt: string;
};
