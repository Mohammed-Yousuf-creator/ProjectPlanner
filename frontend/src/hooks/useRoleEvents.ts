import { useQuery } from '@tanstack/react-query';
import { getMyJudgingEvents, getMyMentoringEvents } from '@/api/endpoints/users';
import { useAuthStore } from '@/stores/authStore';

/**
 * Discovery surfaces for the two event roles that previously had none.
 *
 * Before these endpoints existed, judges and mentors could only reach their
 * events by direct link. Both hooks are cheap (unpaginated; a user holds a
 * handful of roles) and share the `['users','me',…]` key prefix so signing out
 * clears them together.
 */

const STALE_TIME = 60_000;

export function useMyJudgingEvents(enabled = true) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  return useQuery({
    queryKey: ['users', 'me', 'judging-events'],
    queryFn: getMyJudgingEvents,
    enabled: enabled && isAuthenticated,
    staleTime: STALE_TIME,
    retry: 0,
  });
}

export function useMyMentoringEvents(enabled = true) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  return useQuery({
    queryKey: ['users', 'me', 'mentoring-events'],
    queryFn: getMyMentoringEvents,
    enabled: enabled && isAuthenticated,
    staleTime: STALE_TIME,
    retry: 0,
  });
}
