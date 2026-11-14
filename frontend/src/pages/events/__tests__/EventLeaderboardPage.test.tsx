import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { Route, Routes } from 'react-router-dom';
import { EventLeaderboardPage } from '@/pages/events/EventLeaderboardPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useAuthStore } from '@/stores/authStore';
import * as leaderboardApi from '@/api/endpoints/leaderboards';

/**
 * PLAN.md §14 test 8: a null rank and a null final score render as "—" and the
 * page never derives or recomputes a score of its own.
 */

vi.mock('@/api/endpoints/leaderboards', () => ({
  getLeaderboard: vi.fn(),
}));

vi.mock('@/hooks/useMyTeamForEvent', () => ({
  useMyTeamForEvent: () => ({ data: undefined, isLoading: false }),
}));

const ENTRY_PENDING = {
  rank: null,
  final_score: null,
  team_id: 'team-1',
  team_name: 'Unjudged Team',
  project_id: 'project-1',
  project_title: 'A promising prototype',
  track_name: null,
  evaluation_count: 0,
};

const ENTRY_RANKED = {
  rank: 1,
  final_score: 87.3456,
  team_id: 'team-2',
  team_name: 'Winning Team',
  project_id: 'project-2',
  project_title: 'The best prototype',
  track_name: 'Climate',
  evaluation_count: 3,
};

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/events/:eventId/leaderboard" element={<EventLeaderboardPage />} />
    </Routes>,
    { route: '/events/event-1/leaderboard' },
  );
}

describe('EventLeaderboardPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, bootstrapping: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a null rank as an em dash rather than guessing a position', async () => {
    vi.mocked(leaderboardApi.getLeaderboard).mockResolvedValue([
      ENTRY_PENDING,
      ENTRY_RANKED,
    ] as never);

    renderPage();

    const unjudgedRow = (await screen.findByText('Unjudged Team')).closest('tr');
    expect(unjudgedRow).not.toBeNull();
    const cells = within(unjudgedRow as HTMLElement).getAllByRole('cell');
    // First two cells are rank + medal; both must be the em dash placeholder.
    expect(cells[0]).toHaveTextContent('—');
    expect(cells[1]).toHaveTextContent('—');
  });

  it('renders the null final score as an em dash with a "not yet judged" badge', async () => {
    vi.mocked(leaderboardApi.getLeaderboard).mockResolvedValue([ENTRY_PENDING] as never);

    renderPage();

    const row = (await screen.findByText('Unjudged Team')).closest('tr') as HTMLElement;
    // Rank, medal and score are all unknown, so three placeholders are shown.
    expect(within(row).getAllByText('—')).toHaveLength(3);
    expect(within(row).getByText('Not yet judged')).toBeInTheDocument();
  });

  it('prints the server score verbatim to 4 decimals without recomputing it', async () => {
    vi.mocked(leaderboardApi.getLeaderboard).mockResolvedValue([ENTRY_RANKED] as never);

    renderPage();

    const row = (await screen.findByText('Winning Team')).closest('tr') as HTMLElement;
    expect(within(row).getByText('87.3456')).toBeInTheDocument();
    expect(within(row).getByText('#1')).toBeInTheDocument();
    expect(within(row).getByText('🥇 Gold')).toBeInTheDocument();
  });

  it('explains the 403 "not published yet" state', async () => {
    const response = {
      status: 403,
      statusText: 'Forbidden',
      data: { detail: 'Leaderboard is available after the event is completed.' },
      headers: {},
      config: { url: '/events/event-1/leaderboard', headers: new AxiosHeaders() },
    } as AxiosResponse;

    vi.mocked(leaderboardApi.getLeaderboard).mockRejectedValue(
      new AxiosError('Forbidden', 'ERR_BAD_REQUEST', { url: '/leaderboard' } as never, undefined, response),
    );

    renderPage();

    expect(await screen.findByText('Leaderboard not published yet')).toBeInTheDocument();
  });
});
