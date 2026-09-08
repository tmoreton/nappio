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
  tokenTtlSeconds: 3600,
};

class FakeTokens implements TokenService {
  async createToken(role: ParticipantRole, roomId: string) {
    return `${role}-token-for-${roomId}`;
  }
}

test('create/join API returns role tokens and makes codes single-use', async () => {
  const store = new PairingStore({
    ttlMs: config.pairingTtlMs,
    codeGenerator: () => '482193',
    roomIdGenerator: () => 'monitor-room',
    keyGenerator: () => 'e2ee-key',
  });
  const server = createPairingServer({ config, tokens: new FakeTokens(), store });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createdResponse = await fetch(`${baseUrl}/api/pair/create`, { method: 'POST' });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as Record<string, string>;
    assert.equal(created.pairingCode, '482193');
    assert.equal(created.babyToken, 'baby-token-for-monitor-room');
    assert.equal(created.encryptionKey, 'e2ee-key');

    const joinedResponse = await fetch(`${baseUrl}/api/pair/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: '482193' }),
    });
    assert.equal(joinedResponse.status, 200);
    const joined = (await joinedResponse.json()) as Record<string, string>;
    assert.equal(joined.parentToken, 'parent-token-for-monitor-room');
    assert.equal(joined.roomId, created.roomId);
    assert.equal(joined.encryptionKey, created.encryptionKey);

    const replay = await fetch(`${baseUrl}/api/pair/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: '482193' }),
    });
    assert.equal(replay.status, 409);
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
