import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { TeamSocket, type TeamSocketStatus } from '@/lib/ws';

/**
 * PLAN.md §14 test 7: the client authenticates in the first frame, never
 * reconnects after a 1008 policy violation, and backs off on other closes.
 *
 * `WebSocket` is replaced with a controllable fake so no network is involved.
 */

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000 } as CloseEvent);
  }

  /* --- test controls --- */

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  serverClose(code: number) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
}

const OPEN = FakeWebSocket.OPEN;

describe('TeamSocket', () => {
  let statuses: TeamSocketStatus[];
  let events: string[];
  let revoked: number;

  beforeEach(() => {
    statuses = [];
    events = [];
    revoked = 0;
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function createSocket(token: string | null = 'jwt-token') {
    const socket = new TeamSocket('team-1', {
      getToken: () => token,
      onStatus: (status) => statuses.push(status),
      onEvent: (event) => events.push(event),
      onAccessRevoked: () => {
        revoked += 1;
      },
    });
    return socket;
  }

  it('sends the authenticate frame first, before anything else', () => {
    const socket = createSocket();
    socket.connect();

    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('ws://localhost:3000/api/v1/teams/team-1/ws');
    expect(ws.sent).toHaveLength(0);

    ws.open();

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'authenticate', access_token: 'jwt-token' });
    expect(statuses).toContain('open');

    socket.dispose();
  });

  it('never puts the token in the URL', () => {
    const socket = createSocket('very-secret');
    socket.connect();

    expect(FakeWebSocket.instances[0].url).not.toContain('very-secret');
    socket.dispose();
  });

  it('marks the connection authenticated and forwards known events only', () => {
    const socket = createSocket();
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.message({ type: 'authenticated', user_id: 'user-1', team_id: 'team-1' });
    expect(statuses).toContain('authenticated');

    ws.message({ type: 'message.created', message: { id: 'm1' } });
    ws.message({ type: 'task.assignees.updated', task_id: 't1' });
    ws.message({ type: 'unknown.thing', whatever: true });
    ws.message({ type: 'pong' });
    ws.onmessage?.({ data: 'not json' } as MessageEvent);

    expect(events).toEqual(['message.created', 'task.assignees.updated']);
    socket.dispose();
  });

  it('does not reconnect after a 1008 policy violation', () => {
    const socket = createSocket();
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.message({ type: 'authenticated' });

    ws.serverClose(1008);
    vi.advanceTimersByTime(120_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(revoked).toBe(1);
    expect(states(statuses)).toContain('closed');
    expect(socket.hasExhaustedRetries).toBe(false);
  });

  it('backs off exponentially on other close codes and resets on success', () => {
    const socket = createSocket();
    socket.connect();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].message({ type: 'authenticated' });

    // First unexpected close -> retry after 1s.
    FakeWebSocket.instances[0].serverClose(1006);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(socket.attemptCount).toBe(1);

    // Second close -> retry after 2s (exponential doubling).
    FakeWebSocket.instances[1].serverClose(1006);
    vi.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(socket.attemptCount).toBe(2);

    // A successful authentication resets the counter.
    FakeWebSocket.instances[2].open();
    FakeWebSocket.instances[2].message({ type: 'authenticated' });
    expect(socket.attemptCount).toBe(0);

    socket.dispose();
  });

  it('stops retrying at the attempt cap', () => {
    const socket = createSocket();
    socket.connect();

    for (let i = 0; i < 12; i += 1) {
      const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
      ws.serverClose(1006);
      vi.advanceTimersByTime(31_000);
    }

    // Capped at 1 initial + 8 reconnect attempts.
    expect(FakeWebSocket.instances.length).toBeLessThanOrEqual(9);
    expect(socket.hasExhaustedRetries).toBe(true);
    expect(states(statuses).at(-1)).toBe('closed');
  });

  it('reconnectNow() resets the cap for the manual retry button', () => {
    const socket = createSocket();
    socket.connect();
    for (let i = 0; i < 10; i += 1) {
      FakeWebSocket.instances[FakeWebSocket.instances.length - 1].serverClose(1006);
      vi.advanceTimersByTime(31_000);
    }
    expect(socket.hasExhaustedRetries).toBe(true);

    const before = FakeWebSocket.instances.length;
    socket.reconnectNow();

    expect(FakeWebSocket.instances.length).toBe(before + 1);
    expect(socket.attemptCount).toBe(0);
    socket.dispose();
  });

  it('closes with status closed when no token is available', () => {
    const socket = createSocket(null);
    socket.connect();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(states(statuses)).toContain('closed');
  });

  it('sends a ping every 25s once authenticated', () => {
    const socket = createSocket();
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.message({ type: 'authenticated' });
    expect(ws.readyState).toBe(OPEN);

    vi.advanceTimersByTime(25_000);
    const pings = ws.sent.filter((frame) => frame.includes('ping'));
    expect(pings).toHaveLength(1);

    socket.dispose();
  });

  it('dispose() stops timers and closes without reconnecting', () => {
    const socket = createSocket();
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.message({ type: 'authenticated' });

    socket.dispose();
    vi.advanceTimersByTime(120_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(states(statuses).at(-1)).toBe('idle');
  });
});

/** Collapse consecutive duplicates so assertions read clearly. */
function states(statuses: TeamSocketStatus[]): TeamSocketStatus[] {
  return statuses.filter((status, index) => status !== statuses[index - 1]);
}
