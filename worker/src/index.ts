import { DurableObject } from 'cloudflare:workers';
import { AccessToken, TrackSource } from 'livekit-server-sdk';

type Env = {
  PAIRINGS: DurableObjectNamespace;
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  PAIRING_TTL_SECONDS: string;
  SESSION_TTL_SECONDS: string;
  TOKEN_TTL_SECONDS: string;
};

type ParticipantRole = 'baby' | 'parent';

type PairingRow = {
  pairingCode: string;
  roomId: string;
  encryptionKey: string;
  expiresAt: number;
  sessionExpiresAt: number;
  claimed: number;
  babyRecoveryHash: string | null;
  parentRecoveryHash: string | null;
  createRequestId: string | null;
  claimRequestId: string | null;
};

type InternalRequest = {
  clientAddress?: string;
  pairingCode?: string;
  recoveryToken?: string;
  requestId?: string;
};

const responseHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(status: number, payload: unknown) {
  return Response.json(payload, { status, headers: responseHeaders });
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomPairingCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0]! % 1_000_000).padStart(6, '0');
}

function requestIdFrom(request: Request) {
  const value = request.headers.get('Idempotency-Key')?.trim();
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();
}

async function hashRecoveryToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function recoveryTokenFor(role: ParticipantRole, requestId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${role}:${requestId}`)),
  );
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 4096) throw new Error('payload-too-large');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function createLiveKitToken(role: ParticipantRole, roomId: string, env: Env) {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error('LiveKit credentials are not configured.');
  }
  if (!/^wss:\/\//.test(env.LIVEKIT_URL)) {
    throw new Error('LIVEKIT_URL must be a secure wss:// URL.');
  }

  const ttlSeconds = positiveInteger(env.TOKEN_TTL_SECONDS, 21_600, 'TOKEN_TTL_SECONDS');
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: `${role}-${crypto.randomUUID()}`,
    name: role === 'baby' ? 'Baby Unit' : 'Parent Unit',
    ttl: ttlSeconds,
    attributes: { role },
  });
  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: role === 'baby',
    canPublishSources:
      role === 'baby' ? [TrackSource.CAMERA, TrackSource.MICROPHONE] : undefined,
    canSubscribe: role === 'parent',
    canPublishData: false,
  });
  return {
    token: await token.toJwt(),
    tokenExpiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

function coordinator(env: Env) {
  return env.PAIRINGS.getByName('global-pairings');
}

async function coordinatorRequest(
  env: Env,
  path: '/create' | '/claim' | '/resume' | '/health',
  payload?: InternalRequest,
) {
  return coordinator(env).fetch(`https://pairings.internal${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

async function handleCreate(request: Request, env: Env) {
  const internal = await coordinatorRequest(env, '/create', {
    clientAddress: request.headers.get('CF-Connecting-IP') ?? 'unknown',
    requestId: requestIdFrom(request),
  });
  const payload = (await internal.json()) as Record<string, unknown>;
  return jsonResponse(internal.status, internal.ok ? { ...payload, livekitUrl: env.LIVEKIT_URL } : payload);
}

async function handleJoin(request: Request, env: Env) {
  const body = await readJson(request);
  const pairingCode = typeof body.pairingCode === 'string' ? body.pairingCode : '';
  if (!/^\d{6}$/.test(pairingCode)) {
    return jsonResponse(400, { error: 'Enter a valid six-digit pairing code.' });
  }

  const internal = await coordinatorRequest(env, '/claim', {
    clientAddress: request.headers.get('CF-Connecting-IP') ?? 'unknown',
    pairingCode,
    requestId: requestIdFrom(request),
  });
  const payload = (await internal.json()) as Record<string, unknown>;
  return jsonResponse(internal.status, internal.ok ? { ...payload, livekitUrl: env.LIVEKIT_URL } : payload);
}

async function handleResume(request: Request, env: Env) {
  const body = await readJson(request);
  const recoveryToken = typeof body.recoveryToken === 'string' ? body.recoveryToken : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(recoveryToken)) {
    return jsonResponse(400, { error: 'The saved monitoring session is invalid.' });
  }

  const internal = await coordinatorRequest(env, '/resume', {
    clientAddress: request.headers.get('CF-Connecting-IP') ?? 'unknown',
    recoveryToken,
  });
  const payload = (await internal.json()) as Record<string, unknown>;
  return jsonResponse(internal.status, internal.ok ? { ...payload, livekitUrl: env.LIVEKIT_URL } : payload);
}

export class PairingCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS pairings (
        pairing_code TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        encryption_key TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        claimed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS pairings_expires_at ON pairings (expires_at);
      CREATE TABLE IF NOT EXISTS rate_limits (
        client_address TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL
      );
    `);

    const columns = new Set(
      this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(pairings)').toArray().map(({ name }) => name),
    );
    if (!columns.has('baby_recovery_hash')) {
      this.ctx.storage.sql.exec('ALTER TABLE pairings ADD COLUMN baby_recovery_hash TEXT');
    }
    if (!columns.has('parent_recovery_hash')) {
      this.ctx.storage.sql.exec('ALTER TABLE pairings ADD COLUMN parent_recovery_hash TEXT');
    }
    if (!columns.has('session_expires_at')) {
      this.ctx.storage.sql.exec('ALTER TABLE pairings ADD COLUMN session_expires_at INTEGER');
    }
    if (!columns.has('create_request_id')) {
      this.ctx.storage.sql.exec('ALTER TABLE pairings ADD COLUMN create_request_id TEXT');
    }
    if (!columns.has('claim_request_id')) {
      this.ctx.storage.sql.exec('ALTER TABLE pairings ADD COLUMN claim_request_id TEXT');
    }
    this.ctx.storage.sql.exec(`
      UPDATE pairings SET session_expires_at = expires_at WHERE session_expires_at IS NULL;
      CREATE INDEX IF NOT EXISTS pairings_session_expires_at ON pairings (session_expires_at);
      CREATE UNIQUE INDEX IF NOT EXISTS pairings_create_request_id ON pairings (create_request_id);
      CREATE UNIQUE INDEX IF NOT EXISTS pairings_claim_request_id ON pairings (claim_request_id);
    `);
  }

  private consumeRateLimit(clientAddress: string) {
    const now = Date.now();
    const cutoff = now - 60_000;
    this.ctx.storage.sql.exec('DELETE FROM rate_limits WHERE window_started_at <= ?', cutoff);
    const existing = this.ctx.storage.sql
      .exec<{ windowStartedAt: number; attempts: number }>(
        `SELECT window_started_at AS windowStartedAt, attempts
         FROM rate_limits WHERE client_address = ?`,
        clientAddress,
      )
      .toArray()[0];

    if (!existing) {
      this.ctx.storage.sql.exec(
        'INSERT INTO rate_limits (client_address, window_started_at, attempts) VALUES (?, ?, 1)',
        clientAddress,
        now,
      );
      return true;
    }
    if (existing.attempts >= 12) return false;
    this.ctx.storage.sql.exec(
      'UPDATE rate_limits SET attempts = attempts + 1 WHERE client_address = ?',
      clientAddress,
    );
    return true;
  }

  private rowForCode(pairingCode: string) {
    return this.ctx.storage.sql
      .exec<PairingRow>(
        `SELECT pairing_code AS pairingCode, room_id AS roomId,
                encryption_key AS encryptionKey, expires_at AS expiresAt,
                session_expires_at AS sessionExpiresAt, claimed,
                baby_recovery_hash AS babyRecoveryHash,
                parent_recovery_hash AS parentRecoveryHash,
                create_request_id AS createRequestId,
                claim_request_id AS claimRequestId
         FROM pairings WHERE pairing_code = ?`,
        pairingCode,
      )
      .toArray()[0];
  }

  private rowForCreateRequest(requestId: string) {
    return this.ctx.storage.sql
      .exec<PairingRow>(
        `SELECT pairing_code AS pairingCode, room_id AS roomId,
                encryption_key AS encryptionKey, expires_at AS expiresAt,
                session_expires_at AS sessionExpiresAt, claimed,
                baby_recovery_hash AS babyRecoveryHash,
                parent_recovery_hash AS parentRecoveryHash,
                create_request_id AS createRequestId,
                claim_request_id AS claimRequestId
         FROM pairings WHERE create_request_id = ?`,
        requestId,
      )
      .toArray()[0];
  }

  private rowForClaimRequest(requestId: string) {
    return this.ctx.storage.sql
      .exec<PairingRow>(
        `SELECT pairing_code AS pairingCode, room_id AS roomId,
                encryption_key AS encryptionKey, expires_at AS expiresAt,
                session_expires_at AS sessionExpiresAt, claimed,
                baby_recovery_hash AS babyRecoveryHash,
                parent_recovery_hash AS parentRecoveryHash,
                create_request_id AS createRequestId,
                claim_request_id AS claimRequestId
         FROM pairings WHERE claim_request_id = ?`,
        requestId,
      )
      .toArray()[0];
  }

  private async scheduleCleanup(sessionExpiresAt?: number) {
    const nextStored = this.ctx.storage.sql
      .exec<{ expiresAt: number }>(
        'SELECT MIN(session_expires_at) AS expiresAt FROM pairings WHERE session_expires_at > ?',
        Date.now(),
      )
      .toArray()[0]?.expiresAt;
    const next = Math.min(sessionExpiresAt ?? Number.POSITIVE_INFINITY, nextStored ?? Number.POSITIVE_INFINITY);
    if (!Number.isFinite(next)) return;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || next < current) await this.ctx.storage.setAlarm(next);
  }

  private async createPairing(requestId: string) {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM pairings WHERE session_expires_at <= ?', now);
    const existing = this.rowForCreateRequest(requestId);
    if (existing) {
      const babyRecoveryToken = await recoveryTokenFor('baby', requestId, this.env.LIVEKIT_API_SECRET);
      const access = await createLiveKitToken('baby', existing.roomId, this.env);
      return {
        pairingCode: existing.pairingCode,
        roomId: existing.roomId,
        encryptionKey: existing.encryptionKey,
        expiresAt: new Date(existing.expiresAt).toISOString(),
        sessionExpiresAt: new Date(existing.sessionExpiresAt).toISOString(),
        babyRecoveryToken,
        babyToken: access.token,
        tokenExpiresAt: access.tokenExpiresAt,
      };
    }

    const pairingExpiresAt =
      now + positiveInteger(this.env.PAIRING_TTL_SECONDS, 300, 'PAIRING_TTL_SECONDS') * 1000;
    const sessionExpiresAt =
      now + positiveInteger(this.env.SESSION_TTL_SECONDS, 86_400, 'SESSION_TTL_SECONDS') * 1000;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pairingCode = randomPairingCode();
      const roomId = `monitor-${crypto.randomUUID()}`;
      const encryptionKey = randomBase64Url(32);
      const babyRecoveryToken = await recoveryTokenFor('baby', requestId, this.env.LIVEKIT_API_SECRET);
      const babyRecoveryHash = await hashRecoveryToken(babyRecoveryToken);
      const access = await createLiveKitToken('baby', roomId, this.env);
      const inserted = this.ctx.storage.sql
        .exec<{ pairingCode: string }>(
          `INSERT OR IGNORE INTO pairings
           (pairing_code, room_id, encryption_key, expires_at, claimed,
            baby_recovery_hash, parent_recovery_hash, session_expires_at,
            create_request_id, claim_request_id)
           VALUES (?, ?, ?, ?, 0, ?, NULL, ?, ?, NULL)
           RETURNING pairing_code AS pairingCode`,
          pairingCode,
          roomId,
          encryptionKey,
          pairingExpiresAt,
          babyRecoveryHash,
          sessionExpiresAt,
          requestId,
        )
        .toArray();
      if (inserted.length === 1) {
        await this.scheduleCleanup(sessionExpiresAt);
        return {
          pairingCode,
          roomId,
          encryptionKey,
          expiresAt: new Date(pairingExpiresAt).toISOString(),
          sessionExpiresAt: new Date(sessionExpiresAt).toISOString(),
          babyRecoveryToken,
          babyToken: access.token,
          tokenExpiresAt: access.tokenExpiresAt,
        };
      }

      // Another request with this idempotency key may have committed while this
      // request was creating its token. Replay that row instead of treating the
      // unique request ID as a pairing-code collision for all remaining attempts.
      const concurrentReplay = this.rowForCreateRequest(requestId);
      if (concurrentReplay) {
        const replayAccess = await createLiveKitToken('baby', concurrentReplay.roomId, this.env);
        return {
          pairingCode: concurrentReplay.pairingCode,
          roomId: concurrentReplay.roomId,
          encryptionKey: concurrentReplay.encryptionKey,
          expiresAt: new Date(concurrentReplay.expiresAt).toISOString(),
          sessionExpiresAt: new Date(concurrentReplay.sessionExpiresAt).toISOString(),
          babyRecoveryToken,
          babyToken: replayAccess.token,
          tokenExpiresAt: replayAccess.tokenExpiresAt,
        };
      }
    }
    throw new Error('Could not allocate a unique pairing code.');
  }

  private pairingFailure(row: PairingRow | undefined, pairingCode: string) {
    const now = Date.now();
    if (!row) return jsonResponse(404, { error: 'That pairing code was not found.' });
    if (row.expiresAt <= now) {
      return jsonResponse(410, { error: 'That pairing code has expired.' });
    }
    if (row.claimed) {
      return jsonResponse(409, { error: 'That pairing code has already been used.' });
    }
    return jsonResponse(409, { error: `Pairing code ${pairingCode} could not be claimed.` });
  }

  private async claimPairing(pairingCode: string, requestId: string) {
    const replay = this.rowForClaimRequest(requestId);
    if (replay) {
      if (replay.pairingCode !== pairingCode) {
        return jsonResponse(409, { error: 'That request was already used for another pairing code.' });
      }
      if (replay.sessionExpiresAt <= Date.now()) {
        return jsonResponse(410, { error: 'The saved monitoring session is no longer available.' });
      }
      const parentRecoveryToken = await recoveryTokenFor(
        'parent',
        requestId,
        this.env.LIVEKIT_API_SECRET,
      );
      const access = await createLiveKitToken('parent', replay.roomId, this.env);
      return jsonResponse(200, {
        roomId: replay.roomId,
        parentToken: access.token,
        tokenExpiresAt: access.tokenExpiresAt,
        encryptionKey: replay.encryptionKey,
        expiresAt: new Date(replay.expiresAt).toISOString(),
        sessionExpiresAt: new Date(replay.sessionExpiresAt).toISOString(),
        parentRecoveryToken,
      });
    }

    const row = this.rowForCode(pairingCode);
    if (!row || row.claimed || row.expiresAt <= Date.now()) {
      return this.pairingFailure(row, pairingCode);
    }

    const parentRecoveryToken = await recoveryTokenFor('parent', requestId, this.env.LIVEKIT_API_SECRET);
    const parentRecoveryHash = await hashRecoveryToken(parentRecoveryToken);
    const access = await createLiveKitToken('parent', row.roomId, this.env);
    const updated = this.ctx.storage.sql
      .exec<{ pairingCode: string }>(
        `UPDATE pairings SET claimed = 1, parent_recovery_hash = ?, claim_request_id = ?
         WHERE pairing_code = ? AND claimed = 0 AND expires_at > ?
         RETURNING pairing_code AS pairingCode`,
        parentRecoveryHash,
        requestId,
        pairingCode,
        Date.now(),
      )
      .toArray();
    if (updated.length !== 1) {
      const concurrentReplay = this.rowForClaimRequest(requestId);
      if (concurrentReplay?.pairingCode === pairingCode) {
        return jsonResponse(200, {
          roomId: concurrentReplay.roomId,
          parentToken: access.token,
          tokenExpiresAt: access.tokenExpiresAt,
          encryptionKey: concurrentReplay.encryptionKey,
          expiresAt: new Date(concurrentReplay.expiresAt).toISOString(),
          sessionExpiresAt: new Date(concurrentReplay.sessionExpiresAt).toISOString(),
          parentRecoveryToken,
        });
      }
      return this.pairingFailure(this.rowForCode(pairingCode), pairingCode);
    }

    return jsonResponse(200, {
      roomId: row.roomId,
      parentToken: access.token,
      tokenExpiresAt: access.tokenExpiresAt,
      encryptionKey: row.encryptionKey,
      expiresAt: new Date(row.expiresAt).toISOString(),
      sessionExpiresAt: new Date(row.sessionExpiresAt).toISOString(),
      parentRecoveryToken,
    });
  }

  private async resumeSession(recoveryToken: string) {
    const recoveryHash = await hashRecoveryToken(recoveryToken);
    const now = Date.now();
    const row = this.ctx.storage.sql
      .exec<PairingRow>(
        `SELECT pairing_code AS pairingCode, room_id AS roomId,
                encryption_key AS encryptionKey, expires_at AS expiresAt,
                session_expires_at AS sessionExpiresAt, claimed,
                baby_recovery_hash AS babyRecoveryHash,
                parent_recovery_hash AS parentRecoveryHash,
                create_request_id AS createRequestId,
                claim_request_id AS claimRequestId
         FROM pairings
         WHERE session_expires_at > ?
           AND (baby_recovery_hash = ? OR parent_recovery_hash = ?)
         LIMIT 1`,
        now,
        recoveryHash,
        recoveryHash,
      )
      .toArray()[0];
    if (!row) {
      return jsonResponse(410, { error: 'The saved monitoring session is no longer available.' });
    }

    const role: ParticipantRole = row.babyRecoveryHash === recoveryHash ? 'baby' : 'parent';
    const access = await createLiveKitToken(role, row.roomId, this.env);
    return jsonResponse(200, {
      role,
      roomId: row.roomId,
      token: access.token,
      tokenExpiresAt: access.tokenExpiresAt,
      encryptionKey: row.encryptionKey,
      expiresAt: new Date(row.expiresAt).toISOString(),
      sessionExpiresAt: new Date(row.sessionExpiresAt).toISOString(),
      pairingCode: role === 'baby' && row.expiresAt > now && !row.claimed ? row.pairingCode : undefined,
      recoveryToken,
    });
  }

  async alarm() {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM pairings WHERE session_expires_at <= ?', now);
    this.ctx.storage.sql.exec('DELETE FROM rate_limits WHERE window_started_at <= ?', now - 60_000);
    await this.scheduleCleanup();
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(200, { status: 'ok' });
    }
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

    const body = (await request.json()) as InternalRequest;
    const clientAddress = body.clientAddress?.trim() || 'unknown';
    if (!this.consumeRateLimit(clientAddress)) {
      return jsonResponse(429, { error: 'Too many pairing attempts. Wait a minute and try again.' });
    }

    if (
      url.pathname === '/create' &&
      /^[0-9a-f-]{36}$/i.test(body.requestId ?? '')
    ) {
      return jsonResponse(201, await this.createPairing(body.requestId!));
    }
    if (url.pathname === '/claim' && /^\d{6}$/.test(body.pairingCode ?? '')) {
      if (!/^[0-9a-f-]{36}$/i.test(body.requestId ?? '')) {
        return jsonResponse(400, { error: 'Invalid pairing request.' });
      }
      return this.claimPairing(body.pairingCode!, body.requestId!);
    }
    if (url.pathname === '/resume' && /^[A-Za-z0-9_-]{43}$/.test(body.recoveryToken ?? '')) {
      return this.resumeSession(body.recoveryToken!);
    }
    return jsonResponse(400, { error: 'Invalid pairing request.' });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      try {
        const storage = await coordinatorRequest(env, '/health');
        return jsonResponse(storage.ok ? 200 : 503, {
          status: storage.ok ? 'ok' : 'degraded',
          storage: storage.ok ? 'ok' : 'unavailable',
          livekit: env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET ? 'configured' : 'missing',
        });
      } catch (error) {
        console.error('Health check failed', error);
        return jsonResponse(503, { status: 'degraded', storage: 'unavailable' });
      }
    }

    try {
      if (request.method === 'POST' && url.pathname === '/api/pair/create') {
        return await handleCreate(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/pair/join') {
        return await handleJoin(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/session/resume') {
        return await handleResume(request, env);
      }
      return jsonResponse(404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return jsonResponse(400, { error: 'Request body must be valid JSON.' });
      }
      if (error instanceof Error && error.message === 'payload-too-large') {
        return jsonResponse(413, { error: 'Request body is too large.' });
      }
      console.error('Pairing request failed', error);
      return jsonResponse(500, { error: 'The pairing server could not complete the request.' });
    }
  },
} satisfies ExportedHandler<Env>;
