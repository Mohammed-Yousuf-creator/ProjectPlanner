import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '@/api/client';
import { createTestQueryClient } from '@/test/renderWithProviders';
import { useAuthStore } from '@/stores/authStore';
import { useMyJudgingEvents, useMyMentoringEvents } from '@/hooks/useRoleEvents';
import { useMyTeamForEvent } from '@/hooks/useMyTeamForEvent';
import { useTeamFiles } from '@/hooks/useTeamFiles';

/**
 * These hooks replaced hand-rolled workarounds (probing team membership) and
 * missing endpoints (judge/mentor discovery, team file listing), so the tests
 * assert the *request shape* as well as the resolved data: a regression back to
 * the workaround would call the wrong URL and fail here.
 */

const originalAdapter = apiClient.defaults.adapter;

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

function stubApi(handler: Handler) {
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const { status, data } = handler(config);
    const response = {
      status,
      statusText: '',
      data,
      headers: {},
      config,
    } as AxiosResponse;
    if (status >= 400) {
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, response);
    }
    return response;
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'test-token',
    user: { id: 'user-1' } as never,
    bootstrapping: false,
  });
});

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});

describe('useMyTeamForEvent', () => {
  it('calls the dedicated my-team endpoint instead of probing event teams', async () => {
    const requested: string[] = [];
    stubApi((config) => {
      requested.push(config.url ?? '');
      return {
        status: 200,
        data: { id: 'team-1', name: 'Night Owls', members: [] },
      };
    });

    const { result } = renderHook(() => useMyTeamForEvent('event-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: 'team-1' });
    // Exactly one request, to the new endpoint — no per-team probing.
    expect(requested).toEqual(['/events/event-1/my-team']);
  });

  it('resolves to null when the caller is not on a team (404)', async () => {
    stubApi(() => ({
      status: 404,
      data: { detail: 'You are not on a team for this event.' },
    }));

    const { result } = renderHook(() => useMyTeamForEvent('event-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('surfaces genuine failures instead of masking them as "no team"', async () => {
    stubApi(() => ({ status: 500, data: { detail: 'boom' } }));

    const { result } = renderHook(() => useMyTeamForEvent('event-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('role discovery hooks', () => {
  it('loads judging events from /users/me/judging-events', async () => {
    const requested: string[] = [];
    stubApi((config) => {
      requested.push(config.url ?? '');
      return { status: 200, data: [{ id: 'event-1', name: 'Winter Build Sprint' }] };
    });

    const { result } = renderHook(() => useMyJudgingEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(requested).toEqual(['/users/me/judging-events']);
  });

  it('loads mentoring events from /users/me/mentoring-events', async () => {
    const requested: string[] = [];
    stubApi((config) => {
      requested.push(config.url ?? '');
      return { status: 200, data: [] };
    });

    const { result } = renderHook(() => useMyMentoringEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(requested).toEqual(['/users/me/mentoring-events']);
  });

  it('is disabled when signed out', () => {
    useAuthStore.setState({ accessToken: null, user: null, bootstrapping: false });
    stubApi(() => ({ status: 200, data: [] }));

    const { result } = renderHook(() => useMyJudgingEvents(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useTeamFiles', () => {
  it('lists files from the team endpoint with pagination params', async () => {
    const requested: { url?: string; params?: unknown }[] = [];
    stubApi((config) => {
      requested.push({ url: config.url, params: config.params });
      return {
        status: 200,
        data: [
          {
            id: 'file-1',
            original_filename: 'wireframe.png',
            mime_type: 'image/png',
            uploaded_by_username: 'ada',
          },
        ],
      };
    });

    const { result } = renderHook(() => useTeamFiles('team-1', { limit: 20, offset: 0 }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].original_filename).toBe('wireframe.png');
    expect(requested[0].url).toBe('/teams/team-1/files');
    expect(requested[0].params).toMatchObject({ limit: 20 });
  });
});
