import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import {
  apiClient,
  getAccessToken,
  setAccessToken,
  setRefreshHandler,
  setUnauthorizedHandler,
} from '@/api/client';
import { makeUser } from '@/test/factories';

/**
 * PLAN.md §14 test 1: the auth store persists the token and the axios 401
 * interceptor clears the session rather than leaving a half-authenticated app.
 *
 * The 401 cases drive a real request through the interceptor chain by swapping
 * axios's adapter, so the assertion is about behaviour, not internals.
 */

const STORAGE_KEY = 'ep.access_token';

function failingAdapter(status: number, url: string, detail: string) {
  return (_config: InternalAxiosRequestConfig) => {
    const response = {
      status,
      statusText: '',
      data: { detail },
      headers: {},
      config: { url, headers: new AxiosHeaders() },
    } as AxiosResponse;
    return Promise.reject(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', { url } as never, undefined, response),
    );
  };
}

const originalAdapter = apiClient.defaults.adapter;

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, user: null, bootstrapping: false });
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    setUnauthorizedHandler(null);
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it('stores the token in memory and localStorage on sign-in', () => {
    act(() => {
      useAuthStore.getState().setToken('jwt-token');
      useAuthStore.getState().setUser(makeUser());
    });

    expect(useAuthStore.getState().accessToken).toBe('jwt-token');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('jwt-token');
    expect(useAuthStore.getState().user?.username).toBe('ada');
  });

  it('hydrates the initial token from localStorage on module load', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored-token');
    vi.resetModules();
    const fresh = await import('@/stores/authStore');
    expect(fresh.useAuthStore.getState().accessToken).toBe('stored-token');
  });

  it('clears the token, user and storage on clearSession', () => {
    act(() => {
      useAuthStore.getState().setToken('jwt-token');
      useAuthStore.getState().setUser(makeUser());
      useAuthStore.getState().clearSession();
    });

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('invokes the unauthorized handler on a non-auth 401 response', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setAccessToken('expired-token');
    apiClient.defaults.adapter = failingAdapter(401, '/users/me', 'Not authenticated');

    await expect(apiClient.get('/users/me')).rejects.toBeInstanceOf(AxiosError);

    expect(handler).toHaveBeenCalledWith('Session expired. Please sign in again.');
  });

  it('does not treat a failed sign-in as an expired session', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    apiClient.defaults.adapter = failingAdapter(401, '/auth/login', 'Incorrect email or password');

    await expect(
      apiClient.post('/auth/login', { email: 'ada@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(handler).not.toHaveBeenCalled();
  });

  it('leaves non-401 failures alone', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    apiClient.defaults.adapter = failingAdapter(404, '/events/missing', 'Event not found');

    await expect(apiClient.get('/events/missing')).rejects.toBeInstanceOf(AxiosError);

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('token plumbing', () => {
  it('exposes the token set on the axios layer', () => {
    setAccessToken('abc');
    expect(getAccessToken()).toBe('abc');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });

  it('attaches the bearer token to outgoing requests', async () => {
    setAccessToken('abc');
    let seen: string | null = null;
    apiClient.defaults.adapter = async (config) => {
      seen = (config.headers?.Authorization as string | undefined) ?? null;
      return {
        status: 200,
        statusText: 'OK',
        data: {},
        headers: {},
        config,
      } as AxiosResponse;
    };

    await apiClient.get('/users/me');
    expect(seen).toBe('Bearer abc');

    setAccessToken(null);
    apiClient.defaults.adapter = originalAdapter;
  });
});

describe('useAuthStore hook', () => {
  it('selects isAuthenticated from the token', () => {
    const { result } = renderHook(() => useAuthStore((state) => Boolean(state.accessToken)));
    expect(result.current).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Refresh tokens (Backend_missing.md #4)                                      */
/* -------------------------------------------------------------------------- */

describe('refresh token handling', () => {
  const REFRESH_KEY = 'ep.refresh_token';

  beforeEach(() => {
    localStorage.clear();
    setRefreshHandler(null);
  });

  afterEach(() => {
    setRefreshHandler(null);
    localStorage.clear();
  });

  it('persists both halves of the pair and clears both on logout', () => {
    const store = useAuthStore.getState();
    store.setTokens('access-1', 'refresh-1');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('access-1');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
    expect(useAuthStore.getState().accessToken).toBe('access-1');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-1');

    useAuthStore.getState().clearSession();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it('replays the failed request after a successful refresh', async () => {
    useAuthStore.setState({ accessToken: 'stale', refreshToken: 'refresh-1' });
    setAccessToken('stale');

    const refreshCalls: string[] = [];
    const seenAuth: string[] = [];

    setRefreshHandler(async () => {
      refreshCalls.push('refresh');
      return 'fresh';
    });

    let attempt = 0;
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      attempt += 1;
      seenAuth.push(String(config.headers.Authorization ?? ''));
      // First attempt: expired token. Replay: succeed.
      if (attempt === 1) {
        const response = {
          status: 401,
          statusText: '',
          data: { detail: 'expired' },
          headers: {},
          config,
        } as AxiosResponse;
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response);
      }
      return { status: 200, statusText: '', data: { ok: true }, headers: {}, config } as AxiosResponse;
    };

    const response = await apiClient.get('/protected');
    expect(response.data).toEqual({ ok: true });
    expect(refreshCalls).toHaveLength(1);
    // The replay carried the renewed token, not the stale one.
    expect(seenAuth[0]).toBe('Bearer stale');
    expect(seenAuth[1]).toBe('Bearer fresh');
  });

  it('only refreshes once for concurrent failures', async () => {
    useAuthStore.setState({ accessToken: 'stale', refreshToken: 'refresh-1' });
    setAccessToken('stale');

    let refreshCount = 0;
    setRefreshHandler(async () => {
      refreshCount += 1;
      return 'fresh';
    });

    const attempts = new Map<string, number>();
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const key = String(config.url);
      const count = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, count);
      if (count === 1) {
        const response = {
          status: 401,
          statusText: '',
          data: {},
          headers: {},
          config,
        } as AxiosResponse;
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response);
      }
      return { status: 200, statusText: '', data: { key }, headers: {}, config } as AxiosResponse;
    };

    await Promise.all([
      apiClient.get('/a'),
      apiClient.get('/b'),
      apiClient.get('/c'),
    ]);

    expect(refreshCount).toBe(1);
  });

  it('ends the session when refreshing fails', async () => {
    useAuthStore.setState({ accessToken: 'stale', refreshToken: 'refresh-1' });
    setAccessToken('stale');

    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setRefreshHandler(async () => null); // expired / revoked refresh token

    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response = {
        status: 401,
        statusText: '',
        data: {},
        headers: {},
        config,
      } as AxiosResponse;
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response);
    };

    await expect(apiClient.get('/protected')).rejects.toBeInstanceOf(AxiosError);
    expect(onUnauthorized).toHaveBeenCalledWith('Session expired. Please sign in again.');
  });

  it('never refreshes a failed sign-in attempt', async () => {
    const refresh = vi.fn(async () => 'fresh');
    setRefreshHandler(refresh);

    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response = {
        status: 401,
        statusText: '',
        data: { detail: 'Invalid email or password' },
        headers: {},
        config,
      } as AxiosResponse;
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response);
    };

    await expect(apiClient.post('/auth/login', {})).rejects.toBeInstanceOf(AxiosError);
    expect(refresh).not.toHaveBeenCalled();
  });
});
