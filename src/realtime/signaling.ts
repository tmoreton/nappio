import { createSignalTicket, PairingApiError } from '@/pairing/api';
import type {
  RealtimeClientSignal,
  RealtimeConnectionDetails,
  RealtimeServerMessage,
} from '@/realtime/protocol';
import { parseRealtimeServerMessage } from '@/realtime/protocol';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

type SignalingCallbacks = {
  onReady: (details: RealtimeConnectionDetails) => void;
  onMessage: (message: RealtimeServerMessage) => void;
  onReset: () => void;
  onStatusChange: (status: MonitorStatus) => void;
  onError: (message: string) => void;
};

const PING_INTERVAL_MS = 25_000;
const WELCOME_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 10_000;

export class RealtimeSignalingConnection {
  private socket: WebSocket | null = null;
  private stopped = true;
  private generation = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly session: MonitorSession,
    private readonly callbacks: SignalingCallbacks,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.generation += 1;
    void this.connect(this.generation);
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, 'Monitoring stopped.');
    }
    this.callbacks.onReset();
    this.callbacks.onStatusChange('disconnected');
  }

  restart() {
    if (this.stopped) return;
    this.generation += 1;
    const generation = this.generation;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.callbacks.onReset();
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(4000, 'Restarting monitoring connection.');
    }
    this.reconnectAttempt = 1;
    void this.connect(generation);
  }

  send(signal: RealtimeClientSignal) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(signal));
    return true;
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.welcomeTimer = null;
  }

  private async connect(generation: number) {
    this.callbacks.onStatusChange(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    try {
      const ticket = await createSignalTicket(this.session.recoveryToken);
      if (this.stopped || generation !== this.generation) return;
      if (ticket.roomId !== this.session.roomId || ticket.role !== this.session.role) {
        throw new Error('The signaling ticket did not match this monitoring session.');
      }

      const socket = new WebSocket(ticket.signalingUrl);
      this.socket = socket;
      this.welcomeTimer = setTimeout(() => {
        if (this.socket === socket && socket.readyState < WebSocket.CLOSING) {
          socket.close(4000, 'Signaling room did not respond.');
        }
      }, WELCOME_TIMEOUT_MS);
      socket.onmessage = (event) => {
        if (this.stopped || generation !== this.generation || typeof event.data !== 'string') return;
        const message = parseRealtimeServerMessage(event.data);
        if (!message) return;
        if (message.type === 'welcome') {
          if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
          this.welcomeTimer = null;
          if (message.role !== this.session.role) {
            this.failPermanently('The signaling room assigned the wrong device role.');
            return;
          }
          this.reconnectAttempt = 0;
          this.callbacks.onReady({
            iceServers: ticket.iceServers,
            peerId: message.peerId,
            peers: message.peers,
          });
          this.callbacks.onStatusChange('connected');
          if (this.pingTimer) clearInterval(this.pingTimer);
          this.pingTimer = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send('ping');
          }, PING_INTERVAL_MS);
          return;
        }
        this.callbacks.onMessage(message);
      };
      socket.onerror = () => {
        // The close event owns retry behavior and user-facing status.
      };
      socket.onclose = (event) => {
        if (this.socket === socket) this.socket = null;
        if (this.stopped || generation !== this.generation) return;
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
        this.pingTimer = null;
        this.welcomeTimer = null;
        this.callbacks.onReset();
        if (event.code === 4003 || event.code === 4004) {
          this.failPermanently(event.reason || 'This monitoring room is no longer available.');
          return;
        }
        this.scheduleReconnect(generation);
      };
    } catch (error) {
      if (this.stopped || generation !== this.generation) return;
      if (error instanceof PairingApiError && (error.status === 409 || error.status === 410)) {
        this.failPermanently(error.message);
        return;
      }
      this.scheduleReconnect(generation);
    }
  }

  private scheduleReconnect(generation: number) {
    this.reconnectAttempt += 1;
    this.callbacks.onStatusChange('reconnecting');
    const delay = Math.min(500 * 2 ** Math.min(this.reconnectAttempt, 5), MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped && generation === this.generation) void this.connect(generation);
    }, delay);
  }

  private failPermanently(message: string) {
    this.stopped = true;
    this.generation += 1;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(4002, 'Monitoring session failed.');
    }
    this.callbacks.onReset();
    this.callbacks.onStatusChange('failed');
    this.callbacks.onError(message);
  }
}
