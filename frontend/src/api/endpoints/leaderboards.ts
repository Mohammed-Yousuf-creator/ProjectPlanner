import { cleanParams, request } from '../client';
import type { LeaderboardEntryRead } from '../types';

/**
 * GET /events/{id}/leaderboard.
 * Lives in its own module because it is the only leaderboard route and its
 * access rules (completed events only) differ from judging.
 */
export function getLeaderboard(eventId: string): Promise<LeaderboardEntryRead[]> {
  return request.get<LeaderboardEntryRead[]>('/events/' + eventId + '/leaderboard', {
    params: cleanParams({}),
  });
}
