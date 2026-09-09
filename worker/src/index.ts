import { DurableObject } from 'cloudflare:workers';

type Env = {
  PAIRINGS: DurableObjectNamespace;
  PAIRING_RATE_LIMITER?: RateLimit;
  SESSION_SECRET: string;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  PAIRING_TTL_SECONDS: string;
  SESSION_TTL_SECONDS: string;
  TURN_TTL_SECONDS?: string;
  SHARDED_PAIRINGS_ENABLED?: string;
};

type ParticipantRole = 'baby' | 'parent';

type PairingRow = {
  pairingCode: string;
  roomId: string;
  expiresAt: number;
  sessionExpiresAt: number;
  claimed: number;
  babyRecoveryHash: string | null;
  parentRecoveryHash: string | null;
  createRequestId: string | null;
  claimRequestId: string | null;
};

type ParentSessionRow = PairingRow & {
  parentRecoveryHash: string;
  parentSessionExpiresAt: number;
  claimRequestId: string;
};

type InternalRequest = {
  clientAddress?: string;
  rateLimitKey?: string;
  pairingCode?: string;
  recoveryToken?: string;
  requestId?: string;
  shard?: string;
};

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type SignalSocketAttachment = {
  peerId: string;
  recoveryHash: string;
  role: ParticipantRole;
  roomId: string;
  sessionExpiresAt: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ROUTED_TOKEN_PATTERN = /^s(\d{2})_([A-Za-z0-9_-]{43})$/;
const PAIRING_CODE_PATTERN = /^\d{6}$/;
const SHARD_PATTERN = /^\d{2}$/;
const SHARD_COUNT = 100;
const SESSION_RENEWAL_MINIMUM_MS = 12 * 60 * 60 * 1000;

const responseHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, X-Nappio-Client-Id',
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

function hasValidSessionSecret(secret: string | undefined) {
  return typeof secret === 'string' && secret.trim().length >= 32;
}

function shardedPairingsEnabled(env: Env) {
  return env.SHARDED_PAIRINGS_ENABLED === 'true';
}

function sessionSecret(env: Env) {
  if (!hasValidSessionSecret(env.SESSION_SECRET)) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }
  return env.SESSION_SECRET.trim();
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomPairingCode(shard?: string) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  if (shard) return `${shard}${String(value[0]! % 10_000).padStart(4, '0')}`;
  return String(value[0]! % 1_000_000).padStart(6, '0');
}

function requestIdFrom(request: Request) {
  const value = request.headers.get('Idempotency-Key')?.trim();
  return value && UUID_PATTERN.test(value)
    ? value
    : crypto.randomUUID();
}

async function hashRecoveryToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function shardForRequestId(requestId: string) {
  return String(Number.parseInt(requestId.slice(0, 8), 16) % SHARD_COUNT).padStart(2, '0');
}

function shardFromPairingCode(pairingCode: string) {
  return PAIRING_CODE_PATTERN.test(pairingCode) ? pairingCode.slice(0, 2) : undefined;
}

function shardFromToken(token: string) {
  return token.match(ROUTED_TOKEN_PATTERN)?.[1];
}

function isSessionToken(token: string) {
  return LEGACY_TOKEN_PATTERN.test(token) || ROUTED_TOKEN_PATTERN.test(token);
}

async function recoveryTokenFor(
  role: ParticipantRole,
  requestId: string,
  secret: string,
  shard?: string,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(shard ? `v3:${shard}:${role}:${requestId}` : `${role}:${requestId}`),
    ),
  );
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  const token = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return shard ? `s${shard}_${token}` : token;
}

async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 4096) throw new Error('payload-too-large');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function legacyCoordinator(env: Env) {
  return env.PAIRINGS.getByName('global-pairings');
}

function coordinatorForShard(env: Env, shard: string) {
  if (!SHARD_PATTERN.test(shard)) throw new Error('Invalid pairing shard.');
  return env.PAIRINGS.getByName(`pairing-shard-v3-${shard}`);
}

function coordinatorForToken(env: Env, token: string) {
  const shard = shardFromToken(token);
  return shard ? coordinatorForShard(env, shard) : legacyCoordinator(env);
}

async function coordinatorRequest(
  env: Env,
  coordinator: DurableObjectStub,
  path: '/create' | '/claim' | '/resume' | '/signal-ticket' | '/end' | '/health',
  payload?: InternalRequest,
) {
  return coordinator.fetch(`https://pairings.internal${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

function clientRateLimitKey(request: Request) {
  const clientId = request.headers.get('X-Nappio-Client-Id')?.trim();
  if (clientId && UUID_PATTERN.test(clientId)) return `client:${clientId}`;
  return `legacy-ip:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`;
}

async function enforceEdgePairingLimit(request: Request, env: Env) {
  if (!env.PAIRING_RATE_LIMITER) return true;
  const clientAddress = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const result = await env.PAIRING_RATE_LIMITER.limit({ key: `pairing:${clientAddress}` });
  return result.success;
}

async function handleCreate(request: Request, env: Env) {
  if (!(await enforceEdgePairingLimit(request, env))) {
    return jsonResponse(429, { error: 'Too many pairing attempts. Wait a minute and try again.' });
  }
  const requestId = requestIdFrom(request);
  const shard = shardedPairingsEnabled(env) ? shardForRequestId(requestId) : undefined;
  const coordinator = shard ? coordinatorForShard(env, shard) : legacyCoordinator(env);
  const internal = await coordinatorRequest(env, coordinator, '/create', {
    rateLimitKey: clientRateLimitKey(request),
    requestId,
    shard,
  });
  const payload = (await internal.json()) as Record<string, unknown>;
  return jsonResponse(internal.status, payload);
}

async function handleJoin(request: Request, env: Env) {
  const body = await readJson(request);
  const pairingCode = typeof body.pairingCode === 'string' ? body.pairingCode : '';
  if (!/^\d{6}$/.test(pairingCode)) {
    return jsonResponse(400, { error: 'Enter a valid six-digit pairing code.' });
  }

  if (!(await enforceEdgePairingLimit(request, env))) {
    return jsonResponse(429, { error: 'Too many pairing attempts. Wait a minute and try again.' });
  }
  const shard = shardFromPairingCode(pairingCode)!;
  const payload = {
    rateLimitKey: clientRateLimitKey(request),
    pairingCode,
    requestId: requestIdFrom(request),
    shard,
  };
  let internal = await coordinatorRequest(
    env,
    coordinatorForShard(env, shard),
    '/claim',
    payload,
  );

  // Invites issued by the pre-sharding Worker can remain visible for up to five
  // minutes during deployment. Let those drain through the legacy coordinator.
  if (internal.status === 404) {
    internal = await coordinatorRequest(env, legacyCoordinator(env), '/claim', {
      ...payload,
      shard: undefined,
    });
  }
  const response = (await internal.json()) as Record<string, unknown>;
  return jsonResponse(internal.status, response);
}

async function handleResume(request: Request, env: Env) {
  const body = await readJson(request);
  const recoveryToken = typeof body.recoveryToken === 'string' ? body.recoveryToken : '';
  if (!isSessionToken(recoveryToken)) {
    return jsonResponse(400, { error: 'The saved monitoring session is invalid.' });
  }

  const internal = await coordinatorRequest(env, coordinatorForToken(env, recoveryToken), '/resume', {
    recoveryToken,
  });
  const payload = (await internal.json()) as Record<string, unknown>;
  return jsonResponse(internal.status, payload);
}

function signalingUrlFor(request: Request, ticket: string) {
  const url = new URL('/api/signal', request.url);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

async function turnAttributionId(roomId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(roomId));
  const id = Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `room-${id}`;
}

async function generateIceServers(env: Env, roomId: string): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
    return [{ urls: ['stun:stun.cloudflare.com:3478'] }];
  }

  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttl: positiveInteger(env.TURN_TTL_SECONDS, 86_400, 'TURN_TTL_SECONDS'),
        customIdentifier: await turnAttributionId(roomId),
      }),
    },
  );
  if (!response.ok) throw new Error('TURN credentials could not be generated.');
  const payload = (await response.json()) as { iceServers?: IceServer[] };
  if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
    throw new Error('TURN credential response did not include ICE servers.');
  }
  return payload.iceServers
    .map((server) => ({
      ...server,
      urls: Array.isArray(server.urls)
        ? server.urls.filter((url) => !url.includes('cloudflare.com:53'))
        : server.urls.includes('cloudflare.com:53')
          ? []
          : server.urls,
    }))
    .filter(({ urls }) => typeof urls === 'string' || urls.length > 0);
}

async function handleSignalTicket(request: Request, env: Env) {
  const body = await readJson(request);
  const recoveryToken = typeof body.recoveryToken === 'string' ? body.recoveryToken : '';
  if (!isSessionToken(recoveryToken)) {
    return jsonResponse(400, { error: 'The saved monitoring session is invalid.' });
  }

  const internal = await coordinatorRequest(
    env,
    coordinatorForToken(env, recoveryToken),
    '/signal-ticket',
    { recoveryToken },
  );
  const payload = (await internal.json()) as Record<string, unknown>;
  if (!internal.ok) return jsonResponse(internal.status, payload);
  const ticket = typeof payload.ticket === 'string' ? payload.ticket : '';
  const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
  const iceServers = await generateIceServers(env, roomId);
  return jsonResponse(201, {
    ...payload,
    signalingUrl: signalingUrlFor(request, ticket),
    iceServers,
  });
}

async function handleEndSession(request: Request, env: Env) {
  const body = await readJson(request);
  const recoveryToken = typeof body.recoveryToken === 'string' ? body.recoveryToken : '';
  if (!isSessionToken(recoveryToken)) {
    return jsonResponse(400, { error: 'The saved monitoring session is invalid.' });
  }
  const internal = await coordinatorRequest(
    env,
    coordinatorForToken(env, recoveryToken),
    '/end',
    { recoveryToken },
  );
  if (internal.status === 204) return new Response(null, { status: 204, headers: responseHeaders });
  return jsonResponse(internal.status, await internal.json());
}

function handleSignal(request: Request, env: Env) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return jsonResponse(426, { error: 'A WebSocket connection is required.' });
  }
  const source = new URL(request.url);
  const ticket = source.searchParams.get('ticket') ?? '';
  if (!isSessionToken(ticket)) {
    return jsonResponse(401, { error: 'The signaling ticket is invalid.' });
  }
  const internalUrl = new URL('https://pairings.internal/signal');
  internalUrl.searchParams.set('ticket', ticket);
  return coordinatorForToken(env, ticket).fetch(internalUrl.toString(), {
    headers: { Upgrade: 'websocket' },
  });
}

export class PairingCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
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
      CREATE TABLE IF NOT EXISTS signal_tickets (
        ticket_hash TEXT PRIMARY KEY,
        recovery_hash TEXT NOT NULL,
        room_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('baby', 'parent')),
        expires_at INTEGER NOT NULL,
        session_expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS signal_tickets_expires_at
        ON signal_tickets (expires_at);
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
      CREATE TABLE IF NOT EXISTS parent_sessions (
        recovery_hash TEXT PRIMARY KEY,
        pairing_code TEXT NOT NULL,
        claim_request_id TEXT NOT NULL UNIQUE,
        session_expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS parent_sessions_pairing_code
        ON parent_sessions (pairing_code);
      INSERT OR IGNORE INTO parent_sessions (recovery_hash, pairing_code, claim_request_id)
        SELECT parent_recovery_hash, pairing_code, claim_request_id
        FROM pairings
        WHERE parent_recovery_hash IS NOT NULL AND claim_request_id IS NOT NULL;
    `);
    const parentColumns = new Set(
      this.ctx.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(parent_sessions)')
        .toArray()
        .map(({ name }) => name),
    );
    if (!parentColumns.has('session_expires_at')) {
      this.ctx.storage.sql.exec('ALTER TABLE parent_sessions ADD COLUMN session_expires_at INTEGER');
    }
    this.ctx.storage.sql.exec(`
      UPDATE parent_sessions
      SET session_expires_at = (
        SELECT session_expires_at FROM pairings
        WHERE pairings.pairing_code = parent_sessions.pairing_code
      )
      WHERE session_expires_at IS NULL;
      CREATE INDEX IF NOT EXISTS parent_sessions_expires_at
        ON parent_sessions (session_expires_at);
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
                expires_at AS expiresAt,
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
                expires_at AS expiresAt,
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
      .exec<ParentSessionRow>(
        `SELECT p.pairing_code AS pairingCode, p.room_id AS roomId,
                p.expires_at AS expiresAt,
                p.session_expires_at AS sessionExpiresAt,
                s.session_expires_at AS parentSessionExpiresAt, p.claimed,
                p.baby_recovery_hash AS babyRecoveryHash,
                s.recovery_hash AS parentRecoveryHash,
                p.create_request_id AS createRequestId,
                s.claim_request_id AS claimRequestId
         FROM parent_sessions s
         JOIN pairings p ON p.pairing_code = s.pairing_code
         WHERE s.claim_request_id = ?`,
        requestId,
      )
      .toArray()[0];
  }

  private rowForParentRecovery(recoveryHash: string) {
    return this.ctx.storage.sql
      .exec<ParentSessionRow>(
        `SELECT p.pairing_code AS pairingCode, p.room_id AS roomId,
                p.expires_at AS expiresAt,
                p.session_expires_at AS sessionExpiresAt,
                s.session_expires_at AS parentSessionExpiresAt, p.claimed,
                p.baby_recovery_hash AS babyRecoveryHash,
                s.recovery_hash AS parentRecoveryHash,
                p.create_request_id AS createRequestId,
                s.claim_request_id AS claimRequestId
         FROM parent_sessions s
         JOIN pairings p ON p.pairing_code = s.pairing_code
         WHERE s.recovery_hash = ? AND p.session_expires_at > ? AND s.session_expires_at > ?
         LIMIT 1`,
        recoveryHash,
        Date.now(),
        Date.now(),
      )
      .toArray()[0];
  }

  private purgeExpiredSessions(now: number) {
    this.ctx.storage.sql.exec('DELETE FROM signal_tickets WHERE expires_at <= ?', now);
    this.ctx.storage.sql.exec('DELETE FROM parent_sessions WHERE session_expires_at <= ?', now);
    this.ctx.storage.sql.exec(
      `DELETE FROM parent_sessions
       WHERE pairing_code IN (
         SELECT pairing_code FROM pairings WHERE session_expires_at <= ?
       )`,
      now,
    );
    this.ctx.storage.sql.exec('DELETE FROM pairings WHERE session_expires_at <= ?', now);
  }

  private async scheduleCleanup(sessionExpiresAt?: number) {
    const nextBaby = this.ctx.storage.sql
      .exec<{ expiresAt: number }>(
        'SELECT MIN(session_expires_at) AS expiresAt FROM pairings WHERE session_expires_at > ?',
        Date.now(),
      )
      .toArray()[0]?.expiresAt;
    const nextParent = this.ctx.storage.sql
      .exec<{ expiresAt: number }>(
        'SELECT MIN(session_expires_at) AS expiresAt FROM parent_sessions WHERE session_expires_at > ?',
        Date.now(),
      )
      .toArray()[0]?.expiresAt;
    const next = Math.min(
      sessionExpiresAt ?? Number.POSITIVE_INFINITY,
      nextBaby ?? Number.POSITIVE_INFINITY,
      nextParent ?? Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(next)) return;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || next < current) await this.ctx.storage.setAlarm(next);
  }

  private async createPairing(requestId: string, shard?: string) {
    const now = Date.now();
    this.purgeExpiredSessions(now);
    const existing = this.rowForCreateRequest(requestId);
    if (existing) {
      const babyRecoveryToken = await recoveryTokenFor(
        'baby',
        requestId,
        sessionSecret(this.env),
        shard,
      );
      return {
        pairingCode: existing.pairingCode,
        roomId: existing.roomId,
        expiresAt: new Date(existing.expiresAt).toISOString(),
        sessionExpiresAt: new Date(existing.sessionExpiresAt).toISOString(),
        babyRecoveryToken,
      };
    }

    const pairingExpiresAt =
      now + positiveInteger(this.env.PAIRING_TTL_SECONDS, 300, 'PAIRING_TTL_SECONDS') * 1000;
    const sessionExpiresAt =
      now + positiveInteger(this.env.SESSION_TTL_SECONDS, 86_400, 'SESSION_TTL_SECONDS') * 1000;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pairingCode = randomPairingCode(shard);
      const roomId = `monitor-${crypto.randomUUID()}`;
      const babyRecoveryToken = await recoveryTokenFor(
        'baby',
        requestId,
        sessionSecret(this.env),
        shard,
      );
      const babyRecoveryHash = await hashRecoveryToken(babyRecoveryToken);
      const inserted = this.ctx.storage.sql
        .exec<{ pairingCode: string }>(
          `INSERT OR IGNORE INTO pairings
           (pairing_code, room_id, encryption_key, expires_at, claimed,
            baby_recovery_hash, parent_recovery_hash, session_expires_at,
            create_request_id, claim_request_id)
           VALUES (?, ?, '', ?, 0, ?, NULL, ?, ?, NULL)
           RETURNING pairing_code AS pairingCode`,
          pairingCode,
          roomId,
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
          expiresAt: new Date(pairingExpiresAt).toISOString(),
          sessionExpiresAt: new Date(sessionExpiresAt).toISOString(),
          babyRecoveryToken,
        };
      }

      // Another request with this idempotency key may have committed while this
      // request was creating its token. Replay that row instead of treating the
      // unique request ID as a pairing-code collision for all remaining attempts.
      const concurrentReplay = this.rowForCreateRequest(requestId);
      if (concurrentReplay) {
        return {
          pairingCode: concurrentReplay.pairingCode,
          roomId: concurrentReplay.roomId,
          expiresAt: new Date(concurrentReplay.expiresAt).toISOString(),
          sessionExpiresAt: new Date(concurrentReplay.sessionExpiresAt).toISOString(),
          babyRecoveryToken,
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
    return jsonResponse(409, { error: `Pairing code ${pairingCode} could not be claimed.` });
  }

  private async claimPairing(pairingCode: string, requestId: string, shard?: string) {
    const replay = this.rowForClaimRequest(requestId);
    if (replay) {
      if (replay.pairingCode !== pairingCode) {
        return jsonResponse(409, { error: 'That request was already used for another pairing code.' });
      }
      if (replay.sessionExpiresAt <= Date.now() || replay.parentSessionExpiresAt <= Date.now()) {
        return jsonResponse(410, { error: 'The saved monitoring session is no longer available.' });
      }
      const parentRecoveryToken = await recoveryTokenFor(
        'parent',
        requestId,
        sessionSecret(this.env),
        shard,
      );
      return jsonResponse(200, {
        roomId: replay.roomId,
        expiresAt: new Date(replay.expiresAt).toISOString(),
        sessionExpiresAt: new Date(
          Math.min(replay.sessionExpiresAt, replay.parentSessionExpiresAt),
        ).toISOString(),
        parentRecoveryToken,
      });
    }

    const row = this.rowForCode(pairingCode);
    if (!row || row.expiresAt <= Date.now()) {
      return this.pairingFailure(row, pairingCode);
    }

    const parentRecoveryToken = await recoveryTokenFor(
      'parent',
      requestId,
      sessionSecret(this.env),
      shard,
    );
    const parentRecoveryHash = await hashRecoveryToken(parentRecoveryToken);
    const inserted = this.ctx.storage.sql
      .exec<{ pairingCode: string }>(
        `INSERT OR IGNORE INTO parent_sessions
         (recovery_hash, pairing_code, claim_request_id, session_expires_at)
         SELECT ?, pairing_code, ?, session_expires_at FROM pairings
         WHERE pairing_code = ? AND expires_at > ?
         RETURNING pairing_code AS pairingCode`,
        parentRecoveryHash,
        requestId,
        pairingCode,
        Date.now(),
      )
      .toArray();
    if (inserted.length !== 1) {
      const concurrentReplay = this.rowForClaimRequest(requestId);
      if (concurrentReplay?.pairingCode === pairingCode) {
        return jsonResponse(200, {
          roomId: concurrentReplay.roomId,
          expiresAt: new Date(concurrentReplay.expiresAt).toISOString(),
          sessionExpiresAt: new Date(
            Math.min(
              concurrentReplay.sessionExpiresAt,
              concurrentReplay.parentSessionExpiresAt,
            ),
          ).toISOString(),
          parentRecoveryToken,
        });
      }
      return this.pairingFailure(this.rowForCode(pairingCode), pairingCode);
    }

    // Preserve the legacy marker for safe rolling upgrades. New joins are stored
    // independently in parent_sessions and are not blocked by this value.
    this.ctx.storage.sql.exec('UPDATE pairings SET claimed = 1 WHERE pairing_code = ?', pairingCode);

    return jsonResponse(200, {
      roomId: row.roomId,
      expiresAt: new Date(row.expiresAt).toISOString(),
      sessionExpiresAt: new Date(row.sessionExpiresAt).toISOString(),
      parentRecoveryToken,
    });
  }

  private async renewMembership(
    recoveryHash: string,
    role: ParticipantRole,
    currentExpiresAt: number,
    recoveryToken: string,
  ) {
    if (!shardFromToken(recoveryToken)) return currentExpiresAt;
    const nextExpiresAt =
      Date.now() +
      positiveInteger(this.env.SESSION_TTL_SECONDS, 2_592_000, 'SESSION_TTL_SECONDS') * 1000;
    if (nextExpiresAt - currentExpiresAt < SESSION_RENEWAL_MINIMUM_MS) {
      return currentExpiresAt;
    }
    if (role === 'baby') {
      this.ctx.storage.sql.exec(
        'UPDATE pairings SET session_expires_at = ? WHERE baby_recovery_hash = ?',
        nextExpiresAt,
        recoveryHash,
      );
      const room = this.ctx.storage.sql
        .exec<{ roomId: string }>(
          'SELECT room_id AS roomId FROM pairings WHERE baby_recovery_hash = ?',
          recoveryHash,
        )
        .toArray()[0];
      if (room) {
        for (const socket of this.roomSockets(room.roomId)) {
          const attachment = this.attachmentFor(socket);
          if (!attachment) continue;
          if (attachment.role === 'baby' && attachment.recoveryHash === recoveryHash) {
            socket.serializeAttachment({ ...attachment, sessionExpiresAt: nextExpiresAt });
            continue;
          }
          if (attachment.role === 'parent') {
            const parent = this.ctx.storage.sql
              .exec<{ sessionExpiresAt: number }>(
                'SELECT session_expires_at AS sessionExpiresAt FROM parent_sessions WHERE recovery_hash = ?',
                attachment.recoveryHash,
              )
              .toArray()[0];
            if (parent) {
              socket.serializeAttachment({
                ...attachment,
                sessionExpiresAt: Math.min(nextExpiresAt, parent.sessionExpiresAt),
              });
            }
          }
        }
      }
    } else {
      this.ctx.storage.sql.exec(
        'UPDATE parent_sessions SET session_expires_at = ? WHERE recovery_hash = ?',
        nextExpiresAt,
        recoveryHash,
      );
      const room = this.ctx.storage.sql
        .exec<{ babySessionExpiresAt: number; roomId: string }>(
          `SELECT p.room_id AS roomId, p.session_expires_at AS babySessionExpiresAt
           FROM parent_sessions s
           JOIN pairings p ON p.pairing_code = s.pairing_code
           WHERE s.recovery_hash = ?`,
          recoveryHash,
        )
        .toArray()[0];
      if (room) {
        for (const socket of this.roomSockets(room.roomId)) {
          const attachment = this.attachmentFor(socket);
          if (attachment?.recoveryHash !== recoveryHash) continue;
          socket.serializeAttachment({
            ...attachment,
            sessionExpiresAt: Math.min(room.babySessionExpiresAt, nextExpiresAt),
          });
        }
      }
    }
    await this.scheduleCleanup(nextExpiresAt);
    return nextExpiresAt;
  }

  private async resumeSession(recoveryToken: string) {
    const recoveryHash = await hashRecoveryToken(recoveryToken);
    const now = Date.now();
    const babyRow = this.ctx.storage.sql
      .exec<PairingRow>(
        `SELECT pairing_code AS pairingCode, room_id AS roomId,
                expires_at AS expiresAt,
                session_expires_at AS sessionExpiresAt, claimed,
                baby_recovery_hash AS babyRecoveryHash,
                parent_recovery_hash AS parentRecoveryHash,
                create_request_id AS createRequestId,
                claim_request_id AS claimRequestId
         FROM pairings
         WHERE session_expires_at > ?
           AND baby_recovery_hash = ?
         LIMIT 1`,
        now,
        recoveryHash,
      )
      .toArray()[0];
    const row = babyRow ?? this.rowForParentRecovery(recoveryHash);
    if (!row) {
      return jsonResponse(410, { error: 'The saved monitoring session is no longer available.' });
    }

    const role: ParticipantRole = babyRow ? 'baby' : 'parent';
    const renewedRoleExpiry = await this.renewMembership(
      recoveryHash,
      role,
      role === 'parent' ? (row as ParentSessionRow).parentSessionExpiresAt : row.sessionExpiresAt,
      recoveryToken,
    );
    const sessionExpiresAt =
      role === 'parent' ? Math.min(row.sessionExpiresAt, renewedRoleExpiry) : renewedRoleExpiry;
    return jsonResponse(200, {
      role,
      roomId: row.roomId,
      expiresAt: new Date(row.expiresAt).toISOString(),
      sessionExpiresAt: new Date(sessionExpiresAt).toISOString(),
      pairingCode: role === 'baby' && row.expiresAt > now ? row.pairingCode : undefined,
      recoveryToken,
    });
  }

  private async membershipForRecoveryToken(recoveryToken: string) {
    const recoveryHash = await hashRecoveryToken(recoveryToken);
    const now = Date.now();
    const babyRow = this.ctx.storage.sql
      .exec<{ roomId: string; sessionExpiresAt: number }>(
        `SELECT room_id AS roomId, session_expires_at AS sessionExpiresAt FROM pairings
         WHERE session_expires_at > ? AND baby_recovery_hash = ?
         LIMIT 1`,
        now,
        recoveryHash,
      )
      .toArray()[0];
    if (babyRow) {
      const sessionExpiresAt = await this.renewMembership(
        recoveryHash,
        'baby',
        babyRow.sessionExpiresAt,
        recoveryToken,
      );
      return {
        recoveryHash,
        role: 'baby' as const,
        roomId: babyRow.roomId,
        sessionExpiresAt,
      };
    }
    const parentRow = this.ctx.storage.sql
      .exec<{ roomId: string; babySessionExpiresAt: number; parentSessionExpiresAt: number }>(
        `SELECT p.room_id AS roomId,
                p.session_expires_at AS babySessionExpiresAt,
                s.session_expires_at AS parentSessionExpiresAt
         FROM parent_sessions s
         JOIN pairings p ON p.pairing_code = s.pairing_code
         WHERE p.session_expires_at > ? AND s.session_expires_at > ? AND s.recovery_hash = ?
         LIMIT 1`,
        now,
        now,
        recoveryHash,
      )
      .toArray()[0];
    if (!parentRow) return undefined;
    const renewedParentExpiry = await this.renewMembership(
      recoveryHash,
      'parent',
      parentRow.parentSessionExpiresAt,
      recoveryToken,
    );
    return {
      recoveryHash,
      role: 'parent' as const,
      roomId: parentRow.roomId,
      sessionExpiresAt: Math.min(parentRow.babySessionExpiresAt, renewedParentExpiry),
    };
  }

  private async createSignalTicket(recoveryToken: string) {
    this.ctx.storage.sql.exec('DELETE FROM signal_tickets WHERE expires_at <= ?', Date.now());
    const membership = await this.membershipForRecoveryToken(recoveryToken);
    if (!membership) {
      return jsonResponse(410, { error: 'The saved monitoring session is no longer available.' });
    }
    if (membership.role === 'parent') {
      const connectedParents = new Set(
        this.roomSockets(membership.roomId)
          .filter((socket) => socket.readyState === WebSocket.OPEN)
          .map((socket) => this.attachmentFor(socket))
          .filter(
            (attachment): attachment is SignalSocketAttachment =>
              Boolean(attachment) &&
              attachment!.role === 'parent' &&
              attachment!.recoveryHash !== membership.recoveryHash,
          )
          .map(({ recoveryHash }) => recoveryHash),
      );
      if (connectedParents.size >= 3) {
        return jsonResponse(409, { error: 'This room already has three connected Parent Units.' });
      }
    }

    const shard = shardFromToken(recoveryToken);
    const opaqueTicket = randomBase64Url(32);
    const ticket = shard ? `s${shard}_${opaqueTicket}` : opaqueTicket;
    const ticketHash = await hashRecoveryToken(ticket);
    const expiresAt = Date.now() + 60_000;
    this.ctx.storage.sql.exec(
      `INSERT INTO signal_tickets
       (ticket_hash, recovery_hash, room_id, role, expires_at, session_expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ticketHash,
      membership.recoveryHash,
      membership.roomId,
      membership.role,
      expiresAt,
      membership.sessionExpiresAt,
    );
    return jsonResponse(201, {
      ticket,
      roomId: membership.roomId,
      role: membership.role,
      expiresAt: new Date(expiresAt).toISOString(),
      sessionExpiresAt: new Date(membership.sessionExpiresAt).toISOString(),
    });
  }

  private async endSession(recoveryToken: string) {
    const membership = await this.membershipForRecoveryToken(recoveryToken);
    if (!membership) return new Response(null, { status: 204 });

    const sockets = this.roomSockets(membership.roomId);
    if (membership.role === 'baby') {
      this.ctx.storage.sql.exec(
        `DELETE FROM parent_sessions
         WHERE pairing_code IN (SELECT pairing_code FROM pairings WHERE room_id = ?)`,
        membership.roomId,
      );
      this.ctx.storage.sql.exec('DELETE FROM signal_tickets WHERE room_id = ?', membership.roomId);
      this.ctx.storage.sql.exec(
        'DELETE FROM pairings WHERE room_id = ? AND baby_recovery_hash = ?',
        membership.roomId,
        membership.recoveryHash,
      );
      for (const socket of sockets) socket.close(4005, 'The Baby Unit ended this room.');
      return new Response(null, { status: 204 });
    }

    this.ctx.storage.sql.exec(
      'DELETE FROM signal_tickets WHERE recovery_hash = ?',
      membership.recoveryHash,
    );
    this.ctx.storage.sql.exec(
      'DELETE FROM parent_sessions WHERE recovery_hash = ?',
      membership.recoveryHash,
    );
    for (const socket of sockets) {
      const attachment = this.attachmentFor(socket);
      if (attachment?.recoveryHash === membership.recoveryHash) {
        socket.close(4005, 'This Parent Unit ended its session.');
      }
    }
    return new Response(null, { status: 204 });
  }

  private async consumeSignalTicket(ticket: string) {
    const ticketHash = await hashRecoveryToken(ticket);
    return this.ctx.storage.sql
      .exec<{
        recoveryHash: string;
        role: ParticipantRole;
        roomId: string;
        sessionExpiresAt: number;
      }>(
        `DELETE FROM signal_tickets
         WHERE ticket_hash = ? AND expires_at > ?
         RETURNING recovery_hash AS recoveryHash, role, room_id AS roomId,
                   session_expires_at AS sessionExpiresAt`,
        ticketHash,
        Date.now(),
      )
      .toArray()[0];
  }

  private attachmentFor(socket: WebSocket) {
    return socket.deserializeAttachment() as SignalSocketAttachment | null;
  }

  private roomSockets(roomId: string) {
    return this.ctx.getWebSockets(roomId);
  }

  private broadcastPeerEvent(
    attachment: SignalSocketAttachment,
    type: 'peer-joined' | 'peer-left',
    excludedSocket?: WebSocket,
  ) {
    const message = JSON.stringify({
      type,
      peer: { peerId: attachment.peerId, role: attachment.role },
    });
    for (const socket of this.roomSockets(attachment.roomId)) {
      if (socket === excludedSocket || socket.readyState !== WebSocket.OPEN) continue;
      const recipient = this.attachmentFor(socket);
      if (!recipient || recipient.role === attachment.role) continue;
      socket.send(message);
    }
  }

  private async acceptSignalSocket(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return jsonResponse(426, { error: 'A WebSocket connection is required.' });
    }
    const ticket = new URL(request.url).searchParams.get('ticket') ?? '';
    if (!isSessionToken(ticket)) {
      return jsonResponse(401, { error: 'The signaling ticket is invalid.' });
    }
    const membership = await this.consumeSignalTicket(ticket);
    if (!membership) {
      return jsonResponse(401, { error: 'The signaling ticket is expired or was already used.' });
    }

    const existingSockets = this.roomSockets(membership.roomId);
    const uniqueParents = new Set(
      existingSockets
        .filter((socket) => socket.readyState === WebSocket.OPEN)
        .map((socket) => this.attachmentFor(socket))
        .filter(
          (attachment): attachment is SignalSocketAttachment =>
            Boolean(attachment) &&
            attachment!.role === 'parent' &&
            attachment!.recoveryHash !== membership.recoveryHash,
        )
        .map(({ recoveryHash }) => recoveryHash),
    );
    if (membership.role === 'parent' && uniqueParents.size >= 3) {
      return jsonResponse(409, { error: 'This room already has three connected Parent Units.' });
    }

    for (const socket of existingSockets) {
      const attachment = this.attachmentFor(socket);
      if (!attachment || attachment.recoveryHash !== membership.recoveryHash) continue;
      this.broadcastPeerEvent(attachment, 'peer-left', socket);
      socket.close(4001, 'Reconnected from another socket.');
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment: SignalSocketAttachment = {
      peerId: crypto.randomUUID(),
      recoveryHash: membership.recoveryHash,
      role: membership.role,
      roomId: membership.roomId,
      sessionExpiresAt: membership.sessionExpiresAt,
    };
    this.ctx.acceptWebSocket(server, [membership.roomId]);
    server.serializeAttachment(attachment);

    const peers = this.roomSockets(membership.roomId)
      .filter((socket) => socket !== server && socket.readyState === WebSocket.OPEN)
      .map((socket) => this.attachmentFor(socket))
      .filter(
        (peer): peer is SignalSocketAttachment =>
          Boolean(peer) && peer!.role !== membership.role,
      )
      .map(({ peerId, role }) => ({ peerId, role }));
    server.send(
      JSON.stringify({
        type: 'welcome',
        peerId: attachment.peerId,
        role: attachment.role,
        peers,
      }),
    );
    this.broadcastPeerEvent(attachment, 'peer-joined', server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private relaySignal(socket: WebSocket, message: unknown) {
    const sender = this.attachmentFor(socket);
    if (!sender || !message || typeof message !== 'object') return;
    const signal = message as Record<string, unknown>;
    if (signal.type !== 'signal') return;
    const targetPeerId = typeof signal.targetPeerId === 'string' ? signal.targetPeerId : '';
    const connectionId = typeof signal.connectionId === 'string' ? signal.connectionId : '';
    if (!UUID_PATTERN.test(targetPeerId) || !UUID_PATTERN.test(connectionId)) return;

    const description = signal.description as Record<string, unknown> | undefined;
    const candidate = signal.candidate as Record<string, unknown> | undefined;
    const validDescription =
      description &&
      (description.type === 'offer' || description.type === 'answer') &&
      typeof description.sdp === 'string' &&
      description.sdp.length <= 24_000;
    const validCandidate =
      candidate &&
      typeof candidate.candidate === 'string' &&
      candidate.candidate.length <= 4_096 &&
      (candidate.sdpMid === null || typeof candidate.sdpMid === 'string') &&
      (candidate.sdpMLineIndex === null || Number.isInteger(candidate.sdpMLineIndex));
    if (Boolean(validDescription) === Boolean(validCandidate)) return;

    const target = this.roomSockets(sender.roomId).find((candidateSocket) => {
      const attachment = this.attachmentFor(candidateSocket);
      return (
        candidateSocket.readyState === WebSocket.OPEN &&
        attachment?.peerId === targetPeerId &&
        attachment.role !== sender.role
      );
    });
    if (!target) {
      socket.send(JSON.stringify({ type: 'peer-unavailable', peerId: targetPeerId }));
      return;
    }
    target.send(
      JSON.stringify({
        type: 'signal',
        fromPeerId: sender.peerId,
        connectionId,
        ...(validDescription ? { description } : { candidate }),
      }),
    );
  }

  private recordConnectionReport(socket: WebSocket, message: unknown) {
    const sender = this.attachmentFor(socket);
    if (!sender || sender.role !== 'parent' || !message || typeof message !== 'object') return false;
    const report = message as Record<string, unknown>;
    if (report.type !== 'connection-report') return false;
    if (report.transport !== 'direct' && report.transport !== 'relay') return true;
    console.log(
      JSON.stringify({
        event: 'webrtc_connection',
        role: sender.role,
        transport: report.transport,
      }),
    );
    return true;
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > 32_768) {
      socket.close(1009, 'Signaling message is too large.');
      return;
    }
    const attachment = this.attachmentFor(socket);
    if (!attachment || attachment.sessionExpiresAt <= Date.now()) {
      socket.close(4004, 'This monitoring room has expired.');
      return;
    }
    if (message === 'ping') {
      socket.send('pong');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(message);
      if (!this.recordConnectionReport(socket, parsed)) this.relaySignal(socket, parsed);
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'Invalid signaling message.' }));
    }
  }

  webSocketClose(socket: WebSocket) {
    const attachment = this.attachmentFor(socket);
    if (attachment) this.broadcastPeerEvent(attachment, 'peer-left', socket);
  }

  webSocketError(socket: WebSocket) {
    const attachment = this.attachmentFor(socket);
    if (attachment) this.broadcastPeerEvent(attachment, 'peer-left', socket);
    socket.close(1011, 'Signaling connection failed.');
  }

  async alarm() {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachmentFor(socket);
      if (!attachment || attachment.sessionExpiresAt > now) continue;
      this.broadcastPeerEvent(attachment, 'peer-left', socket);
      socket.close(4004, 'This monitoring room has expired.');
    }
    this.purgeExpiredSessions(now);
    this.ctx.storage.sql.exec('DELETE FROM rate_limits WHERE window_started_at <= ?', now - 60_000);
    await this.scheduleCleanup();
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(200, { status: 'ok' });
    }
    if (request.method === 'GET' && url.pathname === '/signal') {
      return this.acceptSignalSocket(request);
    }
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

    const body = (await request.json()) as InternalRequest;
    if (url.pathname === '/signal-ticket' && isSessionToken(body.recoveryToken ?? '')) {
      return this.createSignalTicket(body.recoveryToken!);
    }
    if (url.pathname === '/end' && isSessionToken(body.recoveryToken ?? '')) {
      return this.endSession(body.recoveryToken!);
    }
    if (
      url.pathname === '/create' &&
      UUID_PATTERN.test(body.requestId ?? '') &&
      (body.shard === undefined || SHARD_PATTERN.test(body.shard))
    ) {
      const rateLimitKey = body.rateLimitKey?.trim() || body.clientAddress?.trim() || 'unknown';
      if (!this.consumeRateLimit(rateLimitKey)) {
        return jsonResponse(429, { error: 'Too many pairing attempts. Wait a minute and try again.' });
      }
      return jsonResponse(201, await this.createPairing(body.requestId!, body.shard));
    }
    if (url.pathname === '/claim' && /^\d{6}$/.test(body.pairingCode ?? '')) {
      if (!UUID_PATTERN.test(body.requestId ?? '')) {
        return jsonResponse(400, { error: 'Invalid pairing request.' });
      }
      if (body.shard !== undefined && body.shard !== shardFromPairingCode(body.pairingCode!)) {
        return jsonResponse(400, { error: 'Invalid pairing shard.' });
      }
      const rateLimitKey = body.rateLimitKey?.trim() || body.clientAddress?.trim() || 'unknown';
      if (!this.consumeRateLimit(rateLimitKey)) {
        return jsonResponse(429, { error: 'Too many pairing attempts. Wait a minute and try again.' });
      }
      return this.claimPairing(body.pairingCode!, body.requestId!, body.shard);
    }
    if (url.pathname === '/resume' && isSessionToken(body.recoveryToken ?? '')) {
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
        const storage = await coordinatorRequest(env, coordinatorForShard(env, '00'), '/health');
        const signalingConfigured = hasValidSessionSecret(env.SESSION_SECRET);
        const healthy = storage.ok && signalingConfigured;
        return jsonResponse(healthy ? 200 : 503, {
          status: healthy ? 'ok' : 'degraded',
          storage: storage.ok ? 'ok' : 'unavailable',
          signaling: signalingConfigured ? 'configured' : 'missing',
          turn: env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN ? 'configured' : 'stun-only',
          routing: shardedPairingsEnabled(env) ? 'sharded' : 'legacy-compatible',
        });
      } catch (error) {
        console.error('Health check failed', error);
        return jsonResponse(503, { status: 'degraded', storage: 'unavailable' });
      }
    }

    if (url.pathname.startsWith('/api/') && !hasValidSessionSecret(env.SESSION_SECRET)) {
      return jsonResponse(503, { error: 'The pairing service is not fully configured.' });
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
      if (request.method === 'POST' && url.pathname === '/api/session/end') {
        return await handleEndSession(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/signal/ticket') {
        return await handleSignalTicket(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/api/signal') {
        return await handleSignal(request, env);
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
