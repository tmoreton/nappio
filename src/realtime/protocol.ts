import type { IceServer } from '@/pairing/types';

export type RealtimePeer = {
  peerId: string;
  role: 'baby' | 'parent';
};

export type RealtimeSessionDescription = {
  type: 'offer' | 'answer';
  sdp: string;
};

export type RealtimeIceCandidate = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

export type RealtimeServerMessage =
  | {
      type: 'welcome';
      peerId: string;
      role: 'baby' | 'parent';
      peers: RealtimePeer[];
    }
  | { type: 'peer-joined' | 'peer-left'; peer: RealtimePeer }
  | {
      type: 'signal';
      fromPeerId: string;
      connectionId: string;
      description?: RealtimeSessionDescription;
      candidate?: RealtimeIceCandidate;
    }
  | { type: 'peer-unavailable'; peerId: string }
  | { type: 'error'; error: string };

export type RealtimeClientSignal = {
  type: 'signal';
  targetPeerId: string;
  connectionId: string;
  description?: RealtimeSessionDescription;
  candidate?: RealtimeIceCandidate;
};

export type RealtimeConnectionDetails = {
  iceServers: IceServer[];
  peerId: string;
  peers: RealtimePeer[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRole(value: unknown): value is RealtimePeer['role'] {
  return value === 'baby' || value === 'parent';
}

function isPeer(value: unknown): value is RealtimePeer {
  if (!value || typeof value !== 'object') return false;
  const peer = value as Partial<RealtimePeer>;
  return typeof peer.peerId === 'string' && UUID.test(peer.peerId) && isRole(peer.role);
}

function isDescription(value: unknown): value is RealtimeSessionDescription {
  if (!value || typeof value !== 'object') return false;
  const description = value as Partial<RealtimeSessionDescription>;
  return (
    (description.type === 'offer' || description.type === 'answer') &&
    typeof description.sdp === 'string' &&
    description.sdp.length <= 24_000
  );
}

function isCandidate(value: unknown): value is RealtimeIceCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RealtimeIceCandidate>;
  return (
    typeof candidate.candidate === 'string' &&
    candidate.candidate.length <= 4_096 &&
    (candidate.sdpMid === null || typeof candidate.sdpMid === 'string') &&
    (candidate.sdpMLineIndex === null || Number.isInteger(candidate.sdpMLineIndex))
  );
}

export function parseRealtimeServerMessage(value: string): RealtimeServerMessage | null {
  if (value === 'pong' || value.length > 32_768) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== 'object') return null;
  const message = decoded as Record<string, unknown>;

  if (
    message.type === 'welcome' &&
    typeof message.peerId === 'string' &&
    UUID.test(message.peerId) &&
    isRole(message.role) &&
    Array.isArray(message.peers) &&
    message.peers.every(isPeer)
  ) {
    return message as RealtimeServerMessage;
  }
  if (
    (message.type === 'peer-joined' || message.type === 'peer-left') &&
    isPeer(message.peer)
  ) {
    return message as RealtimeServerMessage;
  }
  if (
    message.type === 'signal' &&
    typeof message.fromPeerId === 'string' &&
    UUID.test(message.fromPeerId) &&
    typeof message.connectionId === 'string' &&
    UUID.test(message.connectionId) &&
    Boolean(isDescription(message.description)) !== Boolean(isCandidate(message.candidate))
  ) {
    return message as RealtimeServerMessage;
  }
  if (
    message.type === 'peer-unavailable' &&
    typeof message.peerId === 'string' &&
    UUID.test(message.peerId)
  ) {
    return message as RealtimeServerMessage;
  }
  if (message.type === 'error' && typeof message.error === 'string') {
    return message as RealtimeServerMessage;
  }
  return null;
}
