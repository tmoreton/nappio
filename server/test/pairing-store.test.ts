import assert from 'node:assert/strict';
import test from 'node:test';

import { PairingStore, PairingStoreError } from '../src/pairing-store';

const recoveryTokens = ['a'.repeat(43), 'b'.repeat(43), 'c'.repeat(43)];

test('creates a private pairing and gives each parent a resumable claim', () => {
  let recoveryIndex = 0;
  const store = new PairingStore({
    ttlMs: 300_000,
    sessionTtlMs: 86_400_000,
    now: () => 1_000,
    codeGenerator: () => '482193',
    roomIdGenerator: () => 'monitor-private-room',
    keyGenerator: () => 'secret-e2ee-key',
    recoveryTokenGenerator: () => recoveryTokens[recoveryIndex++]!,
  });

  const { pairing, recoveryToken: babyRecoveryToken } = store.create();
  assert.equal(pairing.pairingCode, '482193');
  assert.equal(pairing.roomId, 'monitor-private-room');
  assert.equal(pairing.encryptionKey, 'secret-e2ee-key');
  assert.equal(pairing.expiresAt.toISOString(), new Date(301_000).toISOString());
  assert.equal(pairing.sessionExpiresAt.toISOString(), new Date(86_401_000).toISOString());

  const pending = store.beginClaim('482193');
  assert.equal(store.resume(babyRecoveryToken).role, 'baby');
  assert.equal(store.completeClaim('482193', pending.recoveryToken, pending.requestId), pairing);
  assert.equal(store.resume(pending.recoveryToken).role, 'parent');

  const secondParent = store.beginClaim('482193');
  store.completeClaim('482193', secondParent.recoveryToken, secondParent.requestId);
  assert.equal(store.resume(secondParent.recoveryToken).role, 'parent');
  assert.notEqual(secondParent.recoveryToken, pending.recoveryToken);
});

test('rejects expired pairing codes while preserving the resumable baby session', () => {
  let now = 1_000;
  const store = new PairingStore({
    ttlMs: 1_000,
    sessionTtlMs: 10_000,
    now: () => now,
    codeGenerator: () => '111222',
    recoveryTokenGenerator: () => 'c'.repeat(43),
  });
  const { recoveryToken } = store.create();
  now = 2_000;

  assert.throws(
    () => store.beginClaim('111222'),
    (error: unknown) => error instanceof PairingStoreError && error.code === 'expired',
  );
  assert.equal(store.resume(recoveryToken).role, 'baby');
});

test('expires recovery credentials at the session deadline', () => {
  let now = 1_000;
  const store = new PairingStore({
    ttlMs: 1_000,
    sessionTtlMs: 2_000,
    now: () => now,
    recoveryTokenGenerator: () => 'd'.repeat(43),
  });
  const { recoveryToken } = store.create();
  now = 3_000;

  assert.throws(
    () => store.resume(recoveryToken),
    (error: unknown) => error instanceof PairingStoreError && error.code === 'session-expired',
  );
});

test('rejects unknown codes', () => {
  const store = new PairingStore({ ttlMs: 1_000, sessionTtlMs: 10_000 });
  assert.throws(
    () => store.beginClaim('000000'),
    (error: unknown) => error instanceof PairingStoreError && error.code === 'not-found',
  );
});
