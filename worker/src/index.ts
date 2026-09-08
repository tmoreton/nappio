import { DurableObject } from 'cloudflare:workers';
import { AccessToken, TrackSource } from 'livekit-server-sdk';

type Env = {
  PAIRINGS: DurableObjectNamespace;
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  PAIRING_TTL_SECONDS: string;
  TOKEN_TTL_SECONDS: string;
};

type ParticipantRole = 'baby' | 'parent';

type PairingRecord = {
  pairingCode: string;
  roomId: string;
  encryptionKey: string;
  expiresAt: string;
};

type PairingRow = {
  pairingCode: string;
  roomId: string;
  encryptionKey: string;
  expiresAt: number;
  claimed: number;
};

type InternalRequest = {
  clientAddress?: string;
  pairingCode?: string;
};

const responseHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type',
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

function randomPairingCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0]! % 1_000_000).padStart(6, '0');
}

function randomEncryptionKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function pairingFromRow(row: PairingRow): PairingRecord {
  return {
    pairingCode: row.pairingCode,
    roomId: row.roomId,
    encryptionKey: row.encryptionKey,
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}

async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 4096) {
    throw new Error('payload-too-large');
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function createLiveKitToken(role: ParticipantRole, roomId: string, env: Env) {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new Error('LiveKit credentials are not configured.');
  }
  if (!/^wss:\/\//.test(env.LIVEKIT_URL)) {
    throw new Error('LIVEKIT_URL must be a secure wss:// URL.');
  }

  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: `${role}-${crypto.randomUUID()}`,
    name: role === 'baby' ? 'Baby Unit' : 'Parent Unit',
    ttl: positiveInteger(env.TOKEN_TTL_SECONDS, 21_600, 'TOKEN_TTL_SECONDS'),
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
  return token.toJwt();
}

function coordinator(env: Env) {
  return env.PAIRINGS.getByName('global-pairings');
}

async function coordinatorRequest(
  env: Env,
  path: '/create' | '/claim' | '/health',
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
  });
  const payload = (await internal.json()) as PairingRecord | { error: string };
  if (!internal.ok || 'error' in payload) {
    return jsonResponse(internal.status, payload);
  }

  const babyToken = await createLiveKitToken('baby', payload.roomId, env);
  return jsonResponse(201, {
    ...payload,
    babyToken,
    livekitUrl: env.LIVEKIT_URL,
  });
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
  });
  const payload = (await internal.json()) as PairingRecord | { error: string };
  if (!internal.ok || 'error' in payload) {
    return jsonResponse(internal.status, payload);
  }

  const parentToken = await createLiveKitToken('parent', payload.roomId, env);
  return jsonResponse(200, {
    roomId: payload.roomId,
    parentToken,
    livekitUrl: env.LIVEKIT_URL,
    encryptionKey: payload.encryptionKey,
    expiresAt: payload.expiresAt,
  });
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
    if (existing.attempts >= 12) {
      return false;
    }
    this.ctx.storage.sql.exec(
      'UPDATE rate_limits SET attempts = attempts + 1 WHERE client_address = ?',
      clientAddress,
    );
    return true;
  }

  private createPairing() {
    const now = Date.now();
    const ttlMs =
      positiveInteger(this.env.PAIRING_TTL_SECONDS, 300, 'PAIRING_TTL_SECONDS') * 1000;
    this.ctx.storage.sql.exec('DELETE FROM pairings WHERE expires_at <= ?', now);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const record: PairingRecord = {
        pairingCode: randomPairingCode(),
        roomId: `monitor-${crypto.randomUUID()}`,
        encryptionKey: randomEncryptionKey(),
        expiresAt: new Date(now + ttlMs).toISOString(),
      };
      const inserted = this.ctx.storage.sql
        .exec<{ pairingCode: string }>(
        `INSERT OR IGNORE INTO pairings
         (pairing_code, room_id, encryption_key, expires_at, claimed)
         VALUES (?, ?, ?, ?, 0)
         RETURNING pairing_code AS pairingCode`,
        record.pairingCode,
        record.roomId,
        record.encryptionKey,
        Date.parse(record.expiresAt),
        )
        .toArray();
      if (inserted.length === 1) {
        return record;
      }
    }
    throw new Error('Could not allocate a unique pairing code.');
  }

  private claimPairing(pairingCode: string) {
    const now = Date.now();
    const claimed = this.ctx.storage.sql
      .exec<PairingRow>(
        `UPDATE pairings SET claimed = 1
         WHERE pairing_code = ? AND claimed = 0 AND expires_at > ?
         RETURNING pairing_code AS pairingCode, room_id AS roomId,
                   encryption_key AS encryptionKey, expires_at AS expiresAt, claimed`,
        pairingCode,
        now,
      )
      .toArray()[0];
    if (claimed) {
      return pairingFromRow(claimed);
    }

    const existing = this.ctx.storage.sql
      .exec<PairingRow>(
        `SELECT pairing_code AS pairingCode, room_id AS roomId,
                encryption_key AS encryptionKey, expires_at AS expiresAt, claimed
         FROM pairings WHERE pairing_code = ?`,
        pairingCode,
      )
      .toArray()[0];
    if (!existing) {
      return jsonResponse(404, { error: 'That pairing code was not found.' });
    }
    if (existing.expiresAt <= now) {
      this.ctx.storage.sql.exec('DELETE FROM pairings WHERE pairing_code = ?', pairingCode);
      return jsonResponse(410, { error: 'That pairing code has expired.' });
    }
    return jsonResponse(409, { error: 'That pairing code has already been used.' });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(200, { status: 'ok' });
    }
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const body = (await request.json()) as InternalRequest;
    const clientAddress = body.clientAddress?.trim() || 'unknown';
    if (!this.consumeRateLimit(clientAddress)) {
      return jsonResponse(429, { error: 'Too many pairing attempts. Wait a minute and try again.' });
    }

    if (url.pathname === '/create') {
      return jsonResponse(201, this.createPairing());
    }
    if (url.pathname === '/claim' && /^\d{6}$/.test(body.pairingCode ?? '')) {
      const result = this.claimPairing(body.pairingCode!);
      return result instanceof Response ? result : jsonResponse(200, result);
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
