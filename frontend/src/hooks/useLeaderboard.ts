import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/api/endpoints/leaderboards';

export const leaderboardKeys = {
  event: (eventId: string) => ['events', eventId, 'leaderboard'] as const,
};

/**
 * 403 is expected until the event is completed (public/participants) so the page
 * renders a "published after the event" empty state rather than an error toast.
 */
export function useLeaderboard(eventId: string | undefined) {
  return useQuery({
    queryKey: leaderboardKeys.event(eventId ?? ''),
    queryFn: () => getLeaderboard(eventId as string),
    enabled: Boolean(eventId),
    retry: 0,
  });
}
