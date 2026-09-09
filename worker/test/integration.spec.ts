import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

function post(path: string, body?: unknown, requestId?: string, clientAddress = '203.0.113.10') {
  return exports.default.fetch(`https://nappio.test${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': clientAddress,
      ...(requestId ? { 'Idempotency-Key': requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function tokenGrant(token: string) {
  const encoded = token.split('.')[1]!;
  const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  return (JSON.parse(atob(base64)) as { video: Record<string, unknown> }).video;
}

describe('Nappio pairing Worker', () => {
  it('reports configured storage and LiveKit credentials', async () => {
    const response = await exports.default.fetch('https://nappio.test/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      storage: 'ok',
      livekit: 'configured',
    });
  });

  it('creates, claims, and resumes role-scoped sessions', async () => {
    const createdResponse = await post('/api/pair/create');
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as Record<string, string>;
    expect(created.pairingCode).toMatch(/^\d{6}$/);
    expect(created.babyRecoveryToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.babyToken.split('.')).toHaveLength(3);
    expect(tokenGrant(created.babyToken)).toMatchObject({
      canPublish: true,
      canPublishData: true,
      canPublishSources: ['camera', 'microphone'],
      canSubscribe: true,
    });

    const joinedResponse = await post('/api/pair/join', { pairingCode: created.pairingCode });
    expect(joinedResponse.status).toBe(200);
    const joined = (await joinedResponse.json()) as Record<string, string>;
    expect(joined.roomId).toBe(created.roomId);
    expect(joined.encryptionKey).toBe(created.encryptionKey);
    expect(joined.parentRecoveryToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenGrant(joined.parentToken)).toMatchObject({
      canPublish: true,
      canPublishData: false,
      canPublishSources: ['microphone'],
      canSubscribe: true,
    });

    const resumedResponse = await post('/api/session/resume', {
      recoveryToken: joined.parentRecoveryToken,
    });
    expect(resumedResponse.status).toBe(200);
    const resumed = (await resumedResponse.json()) as Record<string, string>;
    expect(resumed.role).toBe('parent');
    expect(resumed.roomId).toBe(created.roomId);
    expect(resumed.token.split('.')).toHaveLength(3);
  });

  it('lets multiple parents join the same active invite', async () => {
    const clientAddress = '203.0.113.20';
    const created = (await (
      await post('/api/pair/create', undefined, undefined, clientAddress)
    ).json()) as Record<string, string>;
    const responses = await Promise.all([
      post('/api/pair/join', { pairingCode: created.pairingCode }, undefined, clientAddress),
      post('/api/pair/join', { pairingCode: created.pairingCode }, undefined, clientAddress),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    const [firstParent, secondParent] = (await Promise.all(
      responses.map((response) => response.json()),
    )) as Record<string, string>[];
    expect(firstParent.roomId).toBe(created.roomId);
    expect(secondParent.roomId).toBe(created.roomId);
    expect(secondParent.parentRecoveryToken).not.toBe(firstParent.parentRecoveryToken);

    const resumed = await Promise.all(
      [firstParent, secondParent].map((parent) =>
        post(
          '/api/session/resume',
          { recoveryToken: parent.parentRecoveryToken },
          undefined,
          clientAddress,
        ),
      ),
    );
    expect(resumed.map(({ status }) => status)).toEqual([200, 200]);

    const resumedBaby = await post('/api/session/resume', {
      recoveryToken: created.babyRecoveryToken,
    }, undefined, clientAddress);
    expect(resumedBaby.status).toBe(200);
    await expect(resumedBaby.json()).resolves.toMatchObject({
      role: 'baby',
      pairingCode: created.pairingCode,
    });
  });

  it('replays create and join attempts safely after a lost response', async () => {
    const createRequestId = '11111111-1111-4111-8111-111111111111';
    const firstCreate = (await (
      await post('/api/pair/create', undefined, createRequestId)
    ).json()) as Record<string, string>;
    const replayedCreate = (await (
      await post('/api/pair/create', undefined, createRequestId)
    ).json()) as Record<string, string>;
    expect(replayedCreate.roomId).toBe(firstCreate.roomId);
    expect(replayedCreate.pairingCode).toBe(firstCreate.pairingCode);
    expect(replayedCreate.babyRecoveryToken).toBe(firstCreate.babyRecoveryToken);

    const joinRequestId = '22222222-2222-4222-8222-222222222222';
    const firstJoin = (await (
      await post('/api/pair/join', { pairingCode: firstCreate.pairingCode }, joinRequestId)
    ).json()) as Record<string, string>;
    const replayedJoinResponse = await post(
      '/api/pair/join',
      { pairingCode: firstCreate.pairingCode },
      joinRequestId,
    );
    expect(replayedJoinResponse.status).toBe(200);
    const replayedJoin = (await replayedJoinResponse.json()) as Record<string, string>;
    expect(replayedJoin.roomId).toBe(firstJoin.roomId);
    expect(replayedJoin.parentRecoveryToken).toBe(firstJoin.parentRecoveryToken);
  });

  it('coalesces simultaneous retries that use the same idempotency key', async () => {
    const createRequestId = '33333333-3333-4333-8333-333333333333';
    const createResponses = await Promise.all([
      post('/api/pair/create', undefined, createRequestId, '203.0.113.44'),
      post('/api/pair/create', undefined, createRequestId, '203.0.113.44'),
    ]);
    expect(createResponses.map(({ status }) => status)).toEqual([201, 201]);
    const [firstCreate, secondCreate] = (await Promise.all(
      createResponses.map((response) => response.json()),
    )) as Record<string, string>[];
    expect(secondCreate.roomId).toBe(firstCreate.roomId);
    expect(secondCreate.pairingCode).toBe(firstCreate.pairingCode);

    const joinRequestId = '44444444-4444-4444-8444-444444444444';
    const joinResponses = await Promise.all([
      post('/api/pair/join', { pairingCode: firstCreate.pairingCode }, joinRequestId, '203.0.113.44'),
      post('/api/pair/join', { pairingCode: firstCreate.pairingCode }, joinRequestId, '203.0.113.44'),
    ]);
    expect(joinResponses.map(({ status }) => status)).toEqual([200, 200]);
    const [firstJoin, secondJoin] = (await Promise.all(
      joinResponses.map((response) => response.json()),
    )) as Record<string, string>[];
    expect(secondJoin.roomId).toBe(firstJoin.roomId);
    expect(secondJoin.parentRecoveryToken).toBe(firstJoin.parentRecoveryToken);
  });

  it('rejects malformed recovery credentials', async () => {
    const response = await post('/api/session/resume', { recoveryToken: 'not-a-token' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'The saved monitoring session is invalid.' });
  });
});
