import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

export type PairingRecord = {
  pairingCode: string;
  roomId: string;
  encryptionKey: string;
  expiresAt: Date;
  sessionExpiresAt: Date;
  claimed: boolean;
  babyRecoveryHash: string;
  parentRecoveryHash?: string;
  createRequestId: string;
  claimRequestId?: string;
};

export type PairingFailureCode =
  | 'already-used'
  | 'expired'
  | 'not-found'
  | 'request-conflict'
  | 'session-expired';

export class PairingStoreError extends Error {
  constructor(readonly code: PairingFailureCode) {
    super(code);
    this.name = 'PairingStoreError';
  }
}

type PairingStoreOptions = {
  ttlMs: number;
  sessionTtlMs: number;
  now?: () => number;
  codeGenerator?: () => string;
  roomIdGenerator?: () => string;
  keyGenerator?: () => string;
  recoveryTokenGenerator?: () => string;
};

function hashRecoveryToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export class PairingStore {
  private readonly records = new Map<string, PairingRecord>();
  private readonly now: () => number;
  private readonly codeGenerator: () => string;
  private readonly roomIdGenerator: () => string;
  private readonly keyGenerator: () => string;
  private readonly recoveryTokenGenerator: () => string;

  constructor(private readonly options: PairingStoreOptions) {
    this.now = options.now ?? Date.now;
    this.codeGenerator =
      options.codeGenerator ?? (() => randomInt(0, 1_000_000).toString().padStart(6, '0'));
    this.roomIdGenerator = options.roomIdGenerator ?? (() => `monitor-${randomUUID()}`);
    this.keyGenerator = options.keyGenerator ?? (() => randomBytes(32).toString('base64url'));
    this.recoveryTokenGenerator =
      options.recoveryTokenGenerator ?? (() => randomBytes(32).toString('base64url'));
  }

  create(requestId: string = randomUUID(), recoveryToken = this.recoveryTokenGenerator()) {
    this.purgeExpiredSessions();
    const replay = Array.from(this.records.values()).find(
      (pairing) => pairing.createRequestId === requestId,
    );
    if (replay) return { pairing: replay, recoveryToken, isReplay: true };

    let pairingCode = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      pairingCode = this.codeGenerator();
      if (/^\d{6}$/.test(pairingCode) && !this.records.has(pairingCode)) break;
      pairingCode = '';
    }
    if (!pairingCode) throw new Error('Could not allocate a unique pairing code.');

    const record: PairingRecord = {
      pairingCode,
      roomId: this.roomIdGenerator(),
      encryptionKey: this.keyGenerator(),
      expiresAt: new Date(this.now() + this.options.ttlMs),
      sessionExpiresAt: new Date(this.now() + this.options.sessionTtlMs),
      claimed: false,
      babyRecoveryHash: hashRecoveryToken(recoveryToken),
      createRequestId: requestId,
    };
    this.records.set(pairingCode, record);
    return { pairing: record, recoveryToken, isReplay: false };
  }

  beginClaim(
    pairingCode: string,
    requestId: string = randomUUID(),
    recoveryToken = this.recoveryTokenGenerator(),
  ) {
    const replay = Array.from(this.records.values()).find(
      (pairing) => pairing.claimRequestId === requestId,
    );
    if (replay) {
      if (replay.pairingCode !== pairingCode) throw new PairingStoreError('request-conflict');
      return { pairing: replay, recoveryToken, requestId, isReplay: true };
    }
    const pairing = this.requireClaimable(pairingCode);
    return { pairing, recoveryToken, requestId, isReplay: false };
  }

  completeClaim(pairingCode: string, recoveryToken: string, requestId: string) {
    const pairing = this.requireClaimable(pairingCode);
    pairing.claimed = true;
    pairing.parentRecoveryHash = hashRecoveryToken(recoveryToken);
    pairing.claimRequestId = requestId;
    return pairing;
  }

  resume(recoveryToken: string) {
    this.purgeExpiredSessions();
    const recoveryHash = hashRecoveryToken(recoveryToken);
    for (const pairing of this.records.values()) {
      if (pairing.babyRecoveryHash === recoveryHash) return { pairing, role: 'baby' as const };
      if (pairing.parentRecoveryHash === recoveryHash) return { pairing, role: 'parent' as const };
    }
    throw new PairingStoreError('session-expired');
  }

  delete(pairingCode: string) {
    this.records.delete(pairingCode);
  }

  private requireClaimable(pairingCode: string) {
    const record = this.records.get(pairingCode);
    if (!record) throw new PairingStoreError('not-found');
    if (record.expiresAt.getTime() <= this.now()) {
      throw new PairingStoreError('expired');
    }
    if (record.claimed) throw new PairingStoreError('already-used');
    return record;
  }

  private purgeExpiredSessions() {
    const now = this.now();
    for (const [code, record] of this.records) {
      if (record.sessionExpiresAt.getTime() <= now) this.records.delete(code);
    }
  }
}
