import { useQuery } from '@tanstack/react-query';
import { getTeam, getEventTeams } from '@/api/endpoints/teams';
import type { TeamDetailRead } from '@/api/types';
import { useAuthStore } from '@/stores/authStore';

/**
 * KNOWN API GAP
 * ------------
 * The backend has no "get my team for this event" endpoint. `GET /teams/{id}`
 * returns `members: null` for non-members and the full roster for active
 * members, so this hook lists the event's teams and probes each one until it
 * finds the caller's team.
 *
 * TODO(BACKEND-QUESTION): replace with a dedicated endpoint (see Backend_missing.md).
 *
 * Guard rails: concurrency capped at 5, results cached per team for 60s, and a
 * 403/404 on a probe is treated as "not your team" rather than an error.
 */
const CONCURRENCY = 5;

async function findMyTeam(teamIds: string[], userId: string | undefined): Promise<TeamDetailRead | null> {
  const queue = [...teamIds];
  let found: TeamDetailRead | null = null;

  async function worker(): Promise<void> {
    while (queue.length > 0 && !found) {
      const teamId = queue.shift();
      if (!teamId) return;
      try {
        const detail = await getTeam(teamId);
        if (!detail.members) continue;
        const isMember = detail.members.some(
          (member) =>
            member.status === 'active' && (!userId || member.user_id === userId),
        );
        if (isMember) {
          found = detail;
          return;
        }
      } catch {
        // 403/404 on a probe simply means this team is not ours.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, teamIds.length) }, worker));
  return found;
}

export function useMyTeamForEvent(eventId: string | undefined, enabled = true) {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: ['events', eventId, 'my-team', userId ?? 'anonymous'],
    enabled: Boolean(eventId) && enabled && Boolean(userId),
    retry: 0,
    staleTime: 60_000,
    queryFn: async (): Promise<TeamDetailRead | null> => {
      try {
        const teams = await getEventTeams(eventId as string, { limit: 100 });
        if (teams.length === 0) return null;
        return await findMyTeam(
          teams.map((team) => team.id),
          userId,
        );
      } catch {
        // 403 = not a registered participant in this event.
        return null;
      }
    },
  });
}
