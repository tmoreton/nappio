import { randomBytes, randomInt, randomUUID } from 'node:crypto';

export type PairingRecord = {
  pairingCode: string;
  roomId: string;
  encryptionKey: string;
  expiresAt: Date;
  claimed: boolean;
};

export type PairingFailureCode = 'already-used' | 'expired' | 'not-found';

export class PairingStoreError extends Error {
  constructor(readonly code: PairingFailureCode) {
    super(code);
    this.name = 'PairingStoreError';
  }
}

type PairingStoreOptions = {
  ttlMs: number;
  now?: () => number;
  codeGenerator?: () => string;
  roomIdGenerator?: () => string;
  keyGenerator?: () => string;
};

export class PairingStore {
  private readonly records = new Map<string, PairingRecord>();
  private readonly now: () => number;
  private readonly codeGenerator: () => string;
  private readonly roomIdGenerator: () => string;
  private readonly keyGenerator: () => string;

  constructor(private readonly options: PairingStoreOptions) {
    this.now = options.now ?? Date.now;
    this.codeGenerator =
      options.codeGenerator ?? (() => randomInt(0, 1_000_000).toString().padStart(6, '0'));
    this.roomIdGenerator = options.roomIdGenerator ?? (() => `monitor-${randomUUID()}`);
    this.keyGenerator = options.keyGenerator ?? (() => randomBytes(32).toString('base64url'));
  }

  create(): PairingRecord {
    this.purgeExpired();
    let pairingCode = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      pairingCode = this.codeGenerator();
      if (/^\d{6}$/.test(pairingCode) && !this.records.has(pairingCode)) {
        break;
      }
      pairingCode = '';
    }
    if (!pairingCode) {
      throw new Error('Could not allocate a unique pairing code.');
    }

    const record: PairingRecord = {
      pairingCode,
      roomId: this.roomIdGenerator(),
      encryptionKey: this.keyGenerator(),
      expiresAt: new Date(this.now() + this.options.ttlMs),
      claimed: false,
    };
    this.records.set(pairingCode, record);
    return record;
  }

  claim(pairingCode: string): PairingRecord {
    const record = this.records.get(pairingCode);
    if (!record) {
      throw new PairingStoreError('not-found');
    }
    if (record.expiresAt.getTime() <= this.now()) {
      this.records.delete(pairingCode);
      throw new PairingStoreError('expired');
    }
    if (record.claimed) {
      throw new PairingStoreError('already-used');
    }
    record.claimed = true;
    return record;
  }

  private purgeExpired() {
    const now = this.now();
    for (const [code, record] of this.records) {
      if (record.expiresAt.getTime() <= now) {
        this.records.delete(code);
      }
    }
  }
}
