import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.NAPPIO_WORKER_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const roomCount = positiveInteger(process.env.LOAD_TEST_ROOMS, 25, 'LOAD_TEST_ROOMS', 100);
const concurrency = positiveInteger(process.env.LOAD_TEST_CONCURRENCY, 5, 'LOAD_TEST_CONCURRENCY', 20);
const p95LimitMs = positiveInteger(process.env.LOAD_TEST_P95_MS, 2_000, 'LOAD_TEST_P95_MS', 30_000);
const productionUrl = 'https://nappio-pairing-api.tmoreton89.workers.dev';

if (baseUrl === productionUrl && process.env.ALLOW_PRODUCTION_LOAD_TEST !== 'true') {
  throw new Error('Set ALLOW_PRODUCTION_LOAD_TEST=true to target the production Worker.');
}

function positiveInteger(value, fallback, name, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}.`);
  }
  return parsed;
}

async function post(path, body, clientId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        'X-Nappio-Client-Id': clientId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const durationMs = performance.now() - started;
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      throw new Error(`${path} returned ${response.status}: ${payload?.error ?? 'unknown error'}`);
    }
    return { durationMs, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function openSignaling(signalingUrl, expectedRole) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(signalingUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out opening the ${expectedRole} signaling socket.`));
    }, 10_000);
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type !== 'welcome') return;
      clearTimeout(timeout);
      if (message.role !== expectedRole) {
        socket.close();
        reject(new Error(`The signaling socket assigned ${message.role} instead of ${expectedRole}.`));
        return;
      }
      resolve({ socket, welcome: message });
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`The ${expectedRole} signaling socket failed.`));
    });
  });
}

function expectPong(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Signaling heartbeat timed out.')), 5_000);
    const onMessage = (event) => {
      if (event.data !== 'pong') return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      resolve();
    };
    socket.addEventListener('message', onMessage);
    socket.send('ping');
  });
}

async function exerciseRoom(index, durations) {
  const clientId = crypto.randomUUID();
  let babyRecoveryToken;
  const sockets = [];
  try {
    const created = await post('/api/pair/create', undefined, clientId);
    durations.push(created.durationMs);
    babyRecoveryToken = created.payload.babyRecoveryToken;

    const joined = await post(
      '/api/pair/join',
      { pairingCode: created.payload.pairingCode },
      clientId,
    );
    durations.push(joined.durationMs);

    const [babyResume, parentResume, babyTicket, parentTicket] = await Promise.all([
      post('/api/session/resume', { recoveryToken: babyRecoveryToken }, clientId),
      post('/api/session/resume', { recoveryToken: joined.payload.parentRecoveryToken }, clientId),
      post('/api/signal/ticket', { recoveryToken: babyRecoveryToken }, clientId),
      post('/api/signal/ticket', { recoveryToken: joined.payload.parentRecoveryToken }, clientId),
    ]);
    durations.push(
      babyResume.durationMs,
      parentResume.durationMs,
      babyTicket.durationMs,
      parentTicket.durationMs,
    );

    const babySignal = await openSignaling(babyTicket.payload.signalingUrl, 'baby');
    sockets.push(babySignal.socket);
    const parentSignal = await openSignaling(parentTicket.payload.signalingUrl, 'parent');
    sockets.push(parentSignal.socket);
    if (!parentSignal.welcome.peers.some((peer) => peer.role === 'baby')) {
      throw new Error('The Parent signaling welcome did not include the Baby peer.');
    }
    await expectPong(parentSignal.socket);
  } catch (error) {
    throw new Error(`Room ${index + 1} failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    sockets.forEach((socket) => socket.close(1000, 'Lifecycle probe complete.'));
    if (babyRecoveryToken) {
      const ended = await post('/api/session/end', { recoveryToken: babyRecoveryToken }, clientId);
      durations.push(ended.durationMs);
    }
  }
}

const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
if (!health.ok) throw new Error(`Health check returned ${health.status}.`);

const durations = [];
const started = performance.now();
let nextRoom = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, roomCount) }, async () => {
    while (nextRoom < roomCount) {
      const index = nextRoom;
      nextRoom += 1;
      await exerciseRoom(index, durations);
    }
  }),
);

const sorted = durations.toSorted((left, right) => left - right);
const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
const result = {
  target: baseUrl,
  rooms: roomCount,
  requests: durations.length,
  webSockets: roomCount * 2,
  elapsedSeconds: Number(((performance.now() - started) / 1_000).toFixed(2)),
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  maxMs: Number(sorted.at(-1).toFixed(1)),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.p95Ms > p95LimitMs) {
  throw new Error(`p95 latency ${result.p95Ms}ms exceeded the ${p95LimitMs}ms limit.`);
}
