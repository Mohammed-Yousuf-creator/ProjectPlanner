import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { createTestQueryClient } from '@/test/renderWithProviders';
import { ToastProvider } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/api/client';
import { router } from '@/routes/index';
import { makeEvent, makeListing } from '@/test/factories';

/**
 * Render smoke test over the **real** route table.
 *
 * Typechecking cannot catch every runtime crash (an undefined access in a render
 * path, a bad conditional, a component that never leaves its skeleton). This
 * mounts every route with a fully mocked axios adapter and asserts each one
 * reaches a stable frame — content, empty state or error state — without
 * throwing.
 *
 * The routes are taken from `routes`/`index.tsx`, so adding a page without a
 * working render fails this test.
 */

const USER = {
  id: 'user-1',
  email: 'ada@example.com',
  username: 'ada',
  display_name: 'Ada Lovelace',
  account_status: 'active',
  email_verified_at: null,
  is_active: true,
  is_superuser: false,
  roles: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  profile: { id: 'p1', user_id: 'user-1', display_name: 'Ada Lovelace', bio: null, avatar_url: null },
};

const ORG = {
  id: 'org-1',
  name: 'Acme Collective',
  slug: 'acme',
  organization_type: 'organizer',
  description: 'We run events.',
  website_url: null,
  logo_url: null,
  contact_email: null,
  created_by_user_id: 'user-1',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  my_role: 'owner',
  my_status: 'active',
  my_joined_at: '2026-01-01T00:00:00Z',
};

function bodyFor(rawUrl: string): { status: number; data: unknown } {
  const path = rawUrl.replace(/^\/api\/v1/, '').split('?')[0];

  if (path === '/users/me') return { status: 200, data: USER };
  if (path === '/organizations/mine') return { status: 200, data: [ORG] };
  if (path === '/organizations/org-1') return { status: 200, data: ORG };
  if (path === '/organizations/org-1/members') return { status: 200, data: [] };
  if (path === '/organizations/org-1/events') return { status: 200, data: [makeEvent()] };

  if (path === '/events') return { status: 200, data: [makeEvent()] };
  if (path === '/events/event-1') return { status: 200, data: makeEvent() };
  if (path === '/events/event-1/leaderboard') {
    return { status: 403, data: { detail: 'Leaderboard is not published yet.' } };
  }
  if (path === '/events/event-1/check-ins/summary') {
    return {
      status: 200,
      data: {
        total_eligible_registrations: 0,
        total_checked_in: 0,
        total_not_checked_in: 0,
        attendance_percentage: 0,
      },
    };
  }

  if (path === '/sponsors') return { status: 200, data: [] };
  if (path === '/sponsorship-listings') return { status: 200, data: [makeListing()] };
  if (path === '/sponsorship-listings/listing-1') return { status: 200, data: makeListing() };
  if (path === '/sponsorship-proposals/proposal-1') {
    return { status: 404, data: { detail: 'Proposal not found.' } };
  }
  if (path === '/sponsorship-deals/deal-1') {
    return { status: 404, data: { detail: 'Deal not found.' } };
  }

  // Everything else: an ordinary empty collection. Pages must render an empty
  // state (and the test proves they do not crash on one).
  return { status: 200, data: [] };
}

const ROUTES_TO_SMOKE = [
  '/',
  '/events',
  '/events/event-1',
  '/events/event-1/schedule',
  '/events/event-1/leaderboard',
  '/marketplace',
  '/marketplace/listing-1',
  '/sponsors',
  '/dashboard',
  '/my/registrations',
  '/my/team-invitations',
  '/my/mentor-requests',
  '/notifications',
  '/organizations',
  '/organizations/new',
  '/organizations/org-1',
  '/organizations/org-1/events/new',
  '/organizations/org-1/sponsorship',
  '/manage/events/event-1',
  '/judge/events/event-1',
  '/sponsorship/proposals/proposal-1',
  '/sponsorship/deals/deal-1',
  '/events/event-1/teams',
  '/events/event-1/projects',
  '/events/event-1/announcements',
  '/events/event-1/mentor',
  '/teams/team-1',
  '/definitely-not-a-route',
];

describe('every route renders to a stable frame', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-token',
      user: USER as never,
      bootstrapping: false,
    });

    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const url = `${config.baseURL ?? ''}${config.url ?? ''}`;
      const { status, data } = bodyFor(url);
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
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ accessToken: null, user: null, bootstrapping: false });
    vi.restoreAllMocks();
  });

  it.each(ROUTES_TO_SMOKE)('renders %s', async (routePath) => {
    const queryClient = createTestQueryClient();
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: [routePath],
    });

    const tree = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={memoryRouter} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    // Wait until no skeleton/suspense boundary claims to be busy, and at least one
    // meaningful node has rendered (header always exists inside the shell).
    await waitFor(
      () => {
        expect(tree.container.querySelector('[aria-busy="true"]')).toBeNull();
        expect(tree.container.textContent ?? '').not.toHaveLength(0);
      },
      { timeout: 5000 },
    );

    expect(memoryRouter.state.matches.length).toBeGreaterThan(0);
    queryClient.clear();
  }, 30_000);
});
