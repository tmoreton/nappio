import { getApiBaseUrl } from '@/config/env';
import * as Crypto from 'expo-crypto';
import type {
  CreatePairingResponse,
  SignalTicketResponse,
  JoinPairingResponse,
  ResumeSessionResponse,
} from '@/pairing/types';

type ErrorPayload = { error?: string };

export class PairingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PairingApiError';
  }
}

async function post<T>(path: string, body?: unknown, requestId = Crypto.randomUUID()): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json()) as T & ErrorPayload;
    if (!response.ok) {
      throw new PairingApiError(payload.error ?? 'Pairing request failed.', response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof PairingApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PairingApiError('The pairing server took too long to respond.', 408);
    }
    throw new PairingApiError('Could not reach the pairing server.', 0);
  } finally {
    clearTimeout(timeout);
  }
}

export function createPairing(requestId?: string) {
  return post<CreatePairingResponse>('/api/pair/create', undefined, requestId);
}

export function joinPairing(pairingCode: string, requestId?: string) {
  return post<JoinPairingResponse>('/api/pair/join', { pairingCode }, requestId);
}

export function resumeSession(recoveryToken: string) {
  return post<ResumeSessionResponse>('/api/session/resume', { recoveryToken });
}

export function createSignalTicket(recoveryToken: string) {
  return post<SignalTicketResponse>('/api/signal/ticket', { recoveryToken });
}
