import { useQuery } from '@tanstack/react-query';
import { getMyTeamForEvent } from '@/api/endpoints/teams';
import type { TeamDetailRead } from '@/api/types';
import { useAuthStore } from '@/stores/authStore';
import { toApiError } from '@/lib/errors';

/**
 * The current user's team in an event.
 *
 * Backed by `GET /events/{event_id}/my-team`, which answers the question in one
 * request. A **404 is an expected answer** ("you are not on a team"), not an
 * error, so the query resolves to `null` rather than surfacing a failure — every
 * caller already branches on `data ?? null`.
 *
 * This replaces the former workaround that listed the event's teams and probed
 * each one until it found the caller's.
 */
export function useMyTeamForEvent(eventId: string | undefined, enabled = true) {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: ['events', eventId, 'my-team', userId ?? 'anonymous'],
    enabled: Boolean(eventId) && enabled && Boolean(userId),
    retry: 0,
    staleTime: 60_000,
    queryFn: async (): Promise<TeamDetailRead | null> => {
      try {
        return await getMyTeamForEvent(eventId as string);
      } catch (error) {
        const { status } = toApiError(error);
        // Not on a team, or not an eligible participant: both mean "no team".
        if (status === 404 || status === 403) return null;
        throw error;
      }
    },
  });
}
