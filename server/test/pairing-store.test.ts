import assert from 'node:assert/strict';
import test from 'node:test';

import { PairingStore, PairingStoreError } from '../src/pairing-store';

test('creates a private pairing and allows exactly one claim', () => {
  const store = new PairingStore({
    ttlMs: 300_000,
    now: () => 1_000,
    codeGenerator: () => '482193',
    roomIdGenerator: () => 'monitor-private-room',
    keyGenerator: () => 'secret-e2ee-key',
  });

  const created = store.create();
  assert.equal(created.pairingCode, '482193');
  assert.equal(created.roomId, 'monitor-private-room');
  assert.equal(created.encryptionKey, 'secret-e2ee-key');
  assert.equal(created.expiresAt.toISOString(), new Date(301_000).toISOString());
  assert.equal(store.claim('482193'), created);
  assert.throws(
    () => store.claim('482193'),
    (error: unknown) => error instanceof PairingStoreError && error.code === 'already-used',
  );
});

test('rejects expired pairing codes', () => {
  let now = 1_000;
  const store = new PairingStore({
    ttlMs: 1_000,
    now: () => now,
    codeGenerator: () => '111222',
  });
  store.create();
  now = 2_000;

  assert.throws(
    () => store.claim('111222'),
    (error: unknown) => error instanceof PairingStoreError && error.code === 'expired',
  );
});

test('rejects unknown codes', () => {
  const store = new PairingStore({ ttlMs: 1_000 });
  assert.throws(
    () => store.claim('000000'),
    (error: unknown) => error instanceof PairingStoreError && error.code === 'not-found',
  );
});
