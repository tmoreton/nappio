import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

import type { ServerConfig } from '../src/config';
import { createPairingServer } from '../src/http-server';
import { PairingStore } from '../src/pairing-store';
import type { ParticipantRole, TokenService } from '../src/token-service';

const config: ServerConfig = {
  livekitUrl: 'wss://nappio.example.livekit.cloud',
  livekitApiKey: 'unused-in-test',
  livekitApiSecret: 'unused-in-test',
  port: 0,
  pairingTtlMs: 300_000,
  sessionTtlMs: 86_400_000,
  tokenTtlSeconds: 3600,
};

class FakeTokens implements TokenService {
  async createToken(role: ParticipantRole, roomId: string) {
    return `${role}-token-for-${roomId}`;
  }
}

test('create/join API gives multiple parents independent resumable sessions', async () => {
  const store = new PairingStore({
    ttlMs: config.pairingTtlMs,
    sessionTtlMs: config.sessionTtlMs,
    codeGenerator: () => '482193',
    roomIdGenerator: () => 'monitor-room',
    keyGenerator: () => 'e2ee-key',
    recoveryTokenGenerator: (() => {
      const tokens = ['a'.repeat(43), 'b'.repeat(43), 'c'.repeat(43)];
      let index = 0;
      return () => tokens[index++]!;
    })(),
  });
  const server = createPairingServer({ config, tokens: new FakeTokens(), store });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createRequestId = '11111111-1111-4111-8111-111111111111';
    const createdResponse = await fetch(`${baseUrl}/api/pair/create`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId },
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as Record<string, string>;
    assert.equal(created.pairingCode, '482193');
    assert.equal(created.babyToken, 'baby-token-for-monitor-room');
    assert.equal(created.encryptionKey, 'e2ee-key');
    assert.match(created.babyRecoveryToken, /^[A-Za-z0-9_-]{43}$/);

    const repeatedCreate = await fetch(`${baseUrl}/api/pair/create`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId },
    });
    assert.equal(repeatedCreate.status, 201);
    const repeatedCreated = (await repeatedCreate.json()) as Record<string, string>;
    assert.equal(repeatedCreated.roomId, created.roomId);
    assert.equal(repeatedCreated.babyRecoveryToken, created.babyRecoveryToken);

    const joinRequestId = '22222222-2222-4222-8222-222222222222';
    const joinedResponse = await fetch(`${baseUrl}/api/pair/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': joinRequestId },
      body: JSON.stringify({ pairingCode: '482193' }),
    });
    assert.equal(joinedResponse.status, 200);
    const joined = (await joinedResponse.json()) as Record<string, string>;
    assert.equal(joined.parentToken, 'parent-token-for-monitor-room');
    assert.equal(joined.roomId, created.roomId);
    assert.equal(joined.encryptionKey, created.encryptionKey);
    assert.match(joined.parentRecoveryToken, /^[A-Za-z0-9_-]{43}$/);

    const repeatedJoin = await fetch(`${baseUrl}/api/pair/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': joinRequestId },
      body: JSON.stringify({ pairingCode: '482193' }),
    });
    assert.equal(repeatedJoin.status, 200);
    const repeatedJoined = (await repeatedJoin.json()) as Record<string, string>;
    assert.equal(repeatedJoined.parentRecoveryToken, joined.parentRecoveryToken);

    const resumedResponse = await fetch(`${baseUrl}/api/session/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoveryToken: joined.parentRecoveryToken }),
    });
    assert.equal(resumedResponse.status, 200);
    const resumed = (await resumedResponse.json()) as Record<string, string>;
    assert.equal(resumed.role, 'parent');
    assert.equal(resumed.token, 'parent-token-for-monitor-room');
    assert.equal(resumed.recoveryToken, joined.parentRecoveryToken);

    const secondJoinRequestId = '33333333-3333-4333-8333-333333333333';
    const secondJoinedResponse = await fetch(`${baseUrl}/api/pair/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': secondJoinRequestId },
      body: JSON.stringify({ pairingCode: '482193' }),
    });
    assert.equal(secondJoinedResponse.status, 200);
    const secondJoined = (await secondJoinedResponse.json()) as Record<string, string>;
    assert.equal(secondJoined.roomId, created.roomId);
    assert.notEqual(secondJoined.parentRecoveryToken, joined.parentRecoveryToken);

    const resumedSecondResponse = await fetch(`${baseUrl}/api/session/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoveryToken: secondJoined.parentRecoveryToken }),
    });
    assert.equal(resumedSecondResponse.status, 200);
    const resumedSecond = (await resumedSecondResponse.json()) as Record<string, string>;
    assert.equal(resumedSecond.role, 'parent');
    assert.equal(resumedSecond.roomId, created.roomId);

    const resumedBabyResponse = await fetch(`${baseUrl}/api/session/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoveryToken: created.babyRecoveryToken }),
    });
    assert.equal(resumedBabyResponse.status, 200);
    const resumedBaby = (await resumedBabyResponse.json()) as Record<string, string>;
    assert.equal(resumedBaby.role, 'baby');
    assert.equal(resumedBaby.pairingCode, created.pairingCode);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('a token-generation failure does not consume the pairing code', async () => {
  let parentAttempts = 0;
  const tokens: TokenService = {
    async createToken(role, roomId) {
      if (role === 'parent' && parentAttempts++ === 0) throw new Error('temporary token failure');
      return `${role}-token-for-${roomId}`;
    },
  };
  const store = new PairingStore({
    ttlMs: config.pairingTtlMs,
    sessionTtlMs: config.sessionTtlMs,
    codeGenerator: () => '654321',
  });
  const server = createPairingServer({ config, tokens, store });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fetch(`${baseUrl}/api/pair/create`, { method: 'POST' });
    const join = () =>
      fetch(`${baseUrl}/api/pair/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: '654321' }),
      });
    assert.equal((await join()).status, 500);
    assert.equal((await join()).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('join API validates pairing codes without leaking internals', async () => {
  const server = createPairingServer({ config, tokens: new FakeTokens() });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/pair/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: '123' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Enter a valid six-digit pairing code.' });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
