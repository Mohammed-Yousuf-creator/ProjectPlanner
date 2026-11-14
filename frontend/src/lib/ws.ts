/**
 * Team collaboration WebSocket client.
 *
 * Protocol (backend README, Phase 5):
 *  1. Connect to `ws(s)://<host>/api/v1/teams/{team_id}/ws`.
 *  2. First frame: {"type":"authenticate","access_token":"<JWT>"}.
 *  3. Server replies {"type":"authenticated","user_id":...,"team_id":...}.
 *  4. Keep-alive: {"type":"ping"} every 25s -> {"type":"pong"}.
 *  5. Broadcasts: message.created/updated/deleted,
 *     task.created/updated/deleted, task.assignees.updated.
 *  6. Close code 1008 = policy violation (auth failure / removed from team):
 *     never reconnect automatically.
 *
 * Payload shapes are treated as opaque: we only forward the event *type* so
 * react-query can invalidate and refetch from REST.
 */

export type TeamSocketStatus = 'idle' | 'connecting' | 'open' | 'authenticated' | 'closed';

export type TeamSocketEvent =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.assignees.updated';

const KNOWN_EVENTS: TeamSocketEvent[] = [
  'message.created',
  'message.updated',
  'message.deleted',
  'task.created',
  'task.updated',
  'task.deleted',
  'task.assignees.updated',
];

const MAX_ATTEMPTS = 8;
const PING_INTERVAL_MS = 25_000;
const POLICY_VIOLATION = 1008;

export type TeamSocketHandlers = {
  onStatus?: (status: TeamSocketStatus) => void;
  onEvent?: (event: TeamSocketEvent) => void;
  /** Fired once when the server rejects the session (close code 1008). */
  onAccessRevoked?: () => void;
  getToken: () => string | null;
};

function wsUrlFor(teamId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v1/teams/${teamId}/ws`;
}

export class TeamSocket {
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private disposed = false;
  private handlers: TeamSocketHandlers;

  constructor(
    private teamId: string,
    handlers: TeamSocketHandlers,
  ) {
    this.handlers = handlers;
  }

  connect(): void {
    if (this.disposed) return;
    const token = this.handlers.getToken();
    if (!token) {
      this.handlers.onStatus?.('closed');
      return;
    }

    this.handlers.onStatus?.('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrlFor(this.teamId));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.handlers.onStatus?.('open');
      // Token travels in the first frame only - never in the URL.
      socket.send(JSON.stringify({ type: 'authenticate', access_token: this.handlers.getToken() }));
    };

    socket.onmessage = (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof payload !== 'object' || payload === null) return;
      const type = (payload as { type?: unknown }).type;
      if (typeof type !== 'string') return;

      if (type === 'authenticated') {
        this.attempts = 0;
        this.handlers.onStatus?.('authenticated');
        this.startPing();
        return;
      }
      if (type === 'pong') return;
      if ((KNOWN_EVENTS as string[]).includes(type)) {
        this.handlers.onEvent?.(type as TeamSocketEvent);
      }
    };

    socket.onclose = (event) => {
      this.stopPing();
      this.socket = null;
      if (this.disposed) return;

      if (event.code === POLICY_VIOLATION) {
        this.handlers.onStatus?.('closed');
        this.handlers.onAccessRevoked?.();
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose always follows; reconnection is handled there.
    };
  }

  /** Manual retry used by the "Reconnect" button after the backoff cap. */
  reconnectNow(): void {
    this.attempts = 0;
    this.clearReconnectTimer();
    if (!this.socket) this.connect();
  }

  get attemptCount(): number {
    return this.attempts;
  }

  get hasExhaustedRetries(): boolean {
    return this.attempts >= MAX_ATTEMPTS;
  }

  dispose(): void {
    this.disposed = true;
    this.stopPing();
    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.handlers.onStatus?.('idle');
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.attempts >= MAX_ATTEMPTS) {
      this.handlers.onStatus?.('closed');
      return;
    }
    const delay = Math.min(1000 * 2 ** this.attempts, 30_000);
    this.attempts += 1;
    this.handlers.onStatus?.('connecting');
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
