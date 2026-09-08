import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';

import type { ServerConfig } from './config';
import { PairingStore, PairingStoreError } from './pairing-store';
import { RateLimiter } from './rate-limiter';
import type { TokenService } from './token-service';

type ServerDependencies = {
  config: ServerConfig;
  tokens: TokenService;
  store?: PairingStore;
  limiter?: RateLimiter;
};

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function send(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 4096) {
      throw new Error('payload-too-large');
    }
    chunks.push(buffer);
  }
  if (!chunks.length) {
    return {} as Record<string, unknown>;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function clientAddress(request: IncomingMessage) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function requestId(request: IncomingMessage) {
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : randomUUID();
}

function recoveryToken(role: 'baby' | 'parent', id: string, secret: string) {
  return createHmac('sha256', secret).update(`${role}:${id}`).digest('base64url');
}

export function createPairingServer({ config, tokens, store, limiter }: ServerDependencies) {
  const pairings =
    store ?? new PairingStore({ ttlMs: config.pairingTtlMs, sessionTtlMs: config.sessionTtlMs });
  const rateLimiter = limiter ?? new RateLimiter();

  return createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, headers);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, { status: 'ok' });
      return;
    }

    if (!rateLimiter.consume(clientAddress(request))) {
      send(response, 429, { error: 'Too many pairing attempts. Wait a minute and try again.' });
      return;
    }

    try {
      if (request.method === 'POST' && url.pathname === '/api/pair/create') {
        const id = requestId(request);
        const savedRecoveryToken = recoveryToken('baby', id, config.livekitApiSecret);
        const { pairing, isReplay } = pairings.create(id, savedRecoveryToken);
        try {
          const babyToken = await tokens.createToken('baby', pairing.roomId);
          send(response, 201, {
            pairingCode: pairing.pairingCode,
            roomId: pairing.roomId,
            babyToken,
            tokenExpiresAt: new Date(Date.now() + config.tokenTtlSeconds * 1000).toISOString(),
            livekitUrl: config.livekitUrl,
            encryptionKey: pairing.encryptionKey,
            expiresAt: pairing.expiresAt.toISOString(),
            sessionExpiresAt: pairing.sessionExpiresAt.toISOString(),
            babyRecoveryToken: savedRecoveryToken,
          });
        } catch (error) {
          if (!isReplay) pairings.delete(pairing.pairingCode);
          throw error;
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/pair/join') {
        const body = await readJson(request);
        const pairingCode = typeof body.pairingCode === 'string' ? body.pairingCode : '';
        if (!/^\d{6}$/.test(pairingCode)) {
          send(response, 400, { error: 'Enter a valid six-digit pairing code.' });
          return;
        }

        const id = requestId(request);
        const savedRecoveryToken = recoveryToken('parent', id, config.livekitApiSecret);
        const { pairing, isReplay } = pairings.beginClaim(pairingCode, id, savedRecoveryToken);
        const parentToken = await tokens.createToken('parent', pairing.roomId);
        if (!isReplay) pairings.completeClaim(pairingCode, savedRecoveryToken, id);
        send(response, 200, {
          roomId: pairing.roomId,
          parentToken,
          tokenExpiresAt: new Date(Date.now() + config.tokenTtlSeconds * 1000).toISOString(),
          livekitUrl: config.livekitUrl,
          encryptionKey: pairing.encryptionKey,
          expiresAt: pairing.expiresAt.toISOString(),
          sessionExpiresAt: pairing.sessionExpiresAt.toISOString(),
          parentRecoveryToken: savedRecoveryToken,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/session/resume') {
        const body = await readJson(request);
        const recoveryToken = typeof body.recoveryToken === 'string' ? body.recoveryToken : '';
        if (!/^[A-Za-z0-9_-]{43}$/.test(recoveryToken)) {
          send(response, 400, { error: 'The saved monitoring session is invalid.' });
          return;
        }

        const { pairing, role } = pairings.resume(recoveryToken);
        const token = await tokens.createToken(role, pairing.roomId);
        send(response, 200, {
          role,
          roomId: pairing.roomId,
          token,
          tokenExpiresAt: new Date(Date.now() + config.tokenTtlSeconds * 1000).toISOString(),
          livekitUrl: config.livekitUrl,
          encryptionKey: pairing.encryptionKey,
          expiresAt: pairing.expiresAt.toISOString(),
          sessionExpiresAt: pairing.sessionExpiresAt.toISOString(),
          pairingCode:
            role === 'baby' && pairing.expiresAt.getTime() > Date.now() && !pairing.claimed
              ? pairing.pairingCode
              : undefined,
          recoveryToken,
        });
        return;
      }

      send(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof PairingStoreError) {
        const result = {
          'already-used': [409, 'That pairing code has already been used.'],
          expired: [410, 'That pairing code has expired.'],
          'not-found': [404, 'That pairing code was not found.'],
          'request-conflict': [409, 'That request was already used for another pairing code.'],
          'session-expired': [410, 'The saved monitoring session is no longer available.'],
        }[error.code] as [number, string];
        send(response, result[0], { error: result[1] });
        return;
      }
      if (error instanceof SyntaxError) {
        send(response, 400, { error: 'Request body must be valid JSON.' });
        return;
      }
      if (error instanceof Error && error.message === 'payload-too-large') {
        send(response, 413, { error: 'Request body is too large.' });
        return;
      }
      console.error('Pairing request failed', error);
      send(response, 500, { error: 'The pairing server could not complete the request.' });
    }
  });
}
