import { env, exports } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const bindings = env as unknown as { PAIRINGS: DurableObjectNamespace };

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

async function openSignal(recoveryToken: string) {
  const ticketResponse = await post('/api/signal/ticket', { recoveryToken });
  expect(ticketResponse.status).toBe(201);
  const ticket = (await ticketResponse.json()) as {
    iceServers: { urls: string | string[] }[];
    signalingUrl: string;
  };
  const url = new URL(ticket.signalingUrl);
  const response = await exports.default.fetch(
    `https://nappio.test/api/signal${url.search}`,
    { headers: { Upgrade: 'websocket' } },
  );
  return { response, ticket };
}

function nextSocketData(socket: WebSocket) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message.')), 2_000);
    socket.addEventListener(
      'message',
      (event) => {
        clearTimeout(timeout);
        resolve(String(event.data));
      },
      { once: true },
    );
  });
}

async function nextMessage(socket: WebSocket) {
  return JSON.parse(await nextSocketData(socket)) as Record<string, unknown>;
}

describe('Nappio pairing Worker', () => {
  it('reports configured signaling with STUN-only local fallback', async () => {
    const response = await exports.default.fetch('https://nappio.test/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      storage: 'ok',
      signaling: 'configured',
      turn: 'stun-only',
      routing: 'sharded',
    });
  });

  it('creates, claims, and resumes role-scoped sessions', async () => {
    const createdResponse = await post('/api/pair/create');
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as Record<string, string>;
    expect(created.pairingCode).toMatch(/^\d{6}$/);
    expect(created.babyRecoveryToken).toMatch(/^s\d{2}_[A-Za-z0-9_-]{43}$/);
    expect(created.babyRecoveryToken.slice(1, 3)).toBe(created.pairingCode.slice(0, 2));
    expect(Date.parse(created.sessionExpiresAt) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(created).not.toHaveProperty('babyToken');
    expect(created).not.toHaveProperty('encryptionKey');

    const joinedResponse = await post('/api/pair/join', { pairingCode: created.pairingCode });
    expect(joinedResponse.status).toBe(200);
    const joined = (await joinedResponse.json()) as Record<string, string>;
    expect(joined.roomId).toBe(created.roomId);
    expect(joined.parentRecoveryToken).toMatch(/^s\d{2}_[A-Za-z0-9_-]{43}$/);
    expect(joined).not.toHaveProperty('parentToken');

    const resumedResponse = await post('/api/session/resume', {
      recoveryToken: joined.parentRecoveryToken,
    });
    expect(resumedResponse.status).toBe(200);
    const resumed = (await resumedResponse.json()) as Record<string, string>;
    expect(resumed.role).toBe('parent');
    expect(resumed.roomId).toBe(created.roomId);
    expect(resumed.recoveryToken).toBe(joined.parentRecoveryToken);
  });

  it('keeps pre-sharding invites and recovery tokens working during rollout', async () => {
    const legacy = bindings.PAIRINGS.getByName('global-pairings');
    const createdResponse = await legacy.fetch('https://pairings.internal/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rateLimitKey: 'legacy-migration-test',
        requestId: '55555555-5555-4555-8555-555555555555',
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as Record<string, string>;
    expect(created.babyRecoveryToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const joinedResponse = await post('/api/pair/join', { pairingCode: created.pairingCode });
    expect(joinedResponse.status).toBe(200);
    const joined = (await joinedResponse.json()) as Record<string, string>;
    expect(joined.parentRecoveryToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      (await post('/api/session/resume', { recoveryToken: created.babyRecoveryToken })).status,
    ).toBe(200);
    expect(
      (await post('/api/session/resume', { recoveryToken: joined.parentRecoveryToken })).status,
    ).toBe(200);
  });

  it('renews routed memberships without rate-limiting authenticated resumes', async () => {
    const created = (await (await post('/api/pair/create')).json()) as Record<string, string>;
    const shard = created.babyRecoveryToken.slice(1, 3);
    const coordinator = bindings.PAIRINGS.getByName(`pairing-shard-v3-${shard}`);
    await runInDurableObject(coordinator, (_instance, state) => {
      state.storage.sql.exec(
        'UPDATE pairings SET session_expires_at = ? WHERE room_id = ?',
        Date.now() + 86_400_000,
        created.roomId,
      );
    });

    const resumes = await Promise.all(
      Array.from({ length: 20 }, () =>
        post('/api/session/resume', { recoveryToken: created.babyRecoveryToken }),
      ),
    );
    expect(resumes.every(({ status }) => status === 200)).toBe(true);
    const renewed = (await resumes[0]!.json()) as Record<string, string>;
    expect(Date.parse(renewed.sessionExpiresAt) - Date.now()).toBeGreaterThan(29 * 86_400_000);
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

  it('revokes Parent access without ending the Baby room', async () => {
    const created = (await (await post('/api/pair/create')).json()) as Record<string, string>;
    const joined = (await (
      await post('/api/pair/join', { pairingCode: created.pairingCode })
    ).json()) as Record<string, string>;

    const ended = await post('/api/session/end', {
      recoveryToken: joined.parentRecoveryToken,
    });
    expect(ended.status).toBe(204);
    expect(
      (await post('/api/session/resume', { recoveryToken: joined.parentRecoveryToken })).status,
    ).toBe(410);
    expect(
      (await post('/api/session/resume', { recoveryToken: created.babyRecoveryToken })).status,
    ).toBe(200);
  });

  it('ends an entire room when the Baby Unit revokes it', async () => {
    const created = (await (await post('/api/pair/create')).json()) as Record<string, string>;
    const joined = (await (
      await post('/api/pair/join', { pairingCode: created.pairingCode })
    ).json()) as Record<string, string>;

    expect(
      (await post('/api/session/end', { recoveryToken: created.babyRecoveryToken })).status,
    ).toBe(204);
    expect(
      (await post('/api/session/resume', { recoveryToken: created.babyRecoveryToken })).status,
    ).toBe(410);
    expect(
      (await post('/api/session/resume', { recoveryToken: joined.parentRecoveryToken })).status,
    ).toBe(410);
  });

  it('issues single-use signaling tickets and relays only across room roles', async () => {
    const created = (await (await post('/api/pair/create')).json()) as Record<string, string>;
    const joined = (await (
      await post('/api/pair/join', { pairingCode: created.pairingCode })
    ).json()) as Record<string, string>;

    const babyConnection = await openSignal(created.babyRecoveryToken);
    expect(babyConnection.ticket.iceServers).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
    ]);
    expect(babyConnection.response.status).toBe(101);
    const babySocket = babyConnection.response.webSocket!;
    babySocket.accept();
    const babyWelcome = await nextMessage(babySocket);
    expect(babyWelcome).toMatchObject({ type: 'welcome', role: 'baby', peers: [] });

    const replayUrl = new URL(babyConnection.ticket.signalingUrl);
    const replay = await exports.default.fetch(
      `https://nappio.test/api/signal${replayUrl.search}`,
      { headers: { Upgrade: 'websocket' } },
    );
    expect(replay.status).toBe(401);

    const parentJoinedMessage = nextMessage(babySocket);
    const parentConnection = await openSignal(joined.parentRecoveryToken);
    expect(parentConnection.response.status).toBe(101);
    const parentSocket = parentConnection.response.webSocket!;
    parentSocket.accept();
    const parentWelcome = await nextMessage(parentSocket);
    const parentJoined = await parentJoinedMessage;
    expect(parentWelcome).toMatchObject({
      type: 'welcome',
      role: 'parent',
      peers: [{ peerId: babyWelcome.peerId, role: 'baby' }],
    });
    expect(parentJoined).toMatchObject({
      type: 'peer-joined',
      peer: { peerId: parentWelcome.peerId, role: 'parent' },
    });

    const pong = nextSocketData(parentSocket);
    parentSocket.send('ping');
    await expect(pong).resolves.toBe('pong');

    const connectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const relayedMessage = nextMessage(babySocket);
    parentSocket.send(
      JSON.stringify({
        type: 'signal',
        targetPeerId: babyWelcome.peerId,
        connectionId,
        description: { type: 'offer', sdp: 'v=0\\r\\n' },
      }),
    );
    await expect(relayedMessage).resolves.toMatchObject({
      type: 'signal',
      fromPeerId: parentWelcome.peerId,
      connectionId,
      description: { type: 'offer', sdp: 'v=0\\r\\n' },
    });

    parentSocket.close(1000, 'Test complete.');
    babySocket.close(1000, 'Test complete.');
  });

  it('caps rooms at three simultaneous Parent connections', async () => {
    const clientAddress = '203.0.113.80';
    const created = (await (
      await post('/api/pair/create', undefined, undefined, clientAddress)
    ).json()) as Record<string, string>;
    const parents: Record<string, string>[] = [];
    for (let index = 0; index < 4; index += 1) {
      parents.push(
        (await (
          await post(
            '/api/pair/join',
            { pairingCode: created.pairingCode },
            undefined,
            clientAddress,
          )
        ).json()) as Record<string, string>,
      );
    }

    const sockets: WebSocket[] = [];
    const peerIds: string[] = [];
    for (const parent of parents.slice(0, 3)) {
      const connection = await openSignal(parent.parentRecoveryToken);
      expect(connection.response.status).toBe(101);
      const socket = connection.response.webSocket!;
      socket.accept();
      const welcome = await nextMessage(socket);
      expect(welcome).toMatchObject({ role: 'parent', peers: [] });
      peerIds.push(String(welcome.peerId));
      sockets.push(socket);
    }

    const unavailable = nextMessage(sockets[0]!);
    sockets[0]!.send(
      JSON.stringify({
        type: 'signal',
        targetPeerId: peerIds[1],
        connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        candidate: { candidate: 'candidate', sdpMid: null, sdpMLineIndex: 0 },
      }),
    );
    await expect(unavailable).resolves.toEqual({
      type: 'peer-unavailable',
      peerId: peerIds[1],
    });

    const fourth = await post('/api/signal/ticket', {
      recoveryToken: parents[3]!.parentRecoveryToken,
    });
    expect(fourth.status).toBe(409);
    await expect(fourth.json()).resolves.toEqual({
      error: 'This room already has three connected Parent Units.',
    });
    sockets.forEach((socket) => socket.close(1000, 'Test complete.'));
  });
});
