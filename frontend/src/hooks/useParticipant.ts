import { useQuery } from '@tanstack/react-query';
import {
  getMyMentorRequests,
  getMyRegisteredEvent,
  getMyRegistrations,
  getMyTeamInvitations,
  getParticipantDashboard,
} from '@/api/endpoints/participants';

export const participantKeys = {
  dashboard: ['participants', 'me', 'dashboard'] as const,
  registrations: ['participants', 'me', 'registrations'] as const,
  event: (eventId: string) => ['participants', 'me', 'events', eventId] as const,
  teamInvitations: ['participants', 'me', 'team-invitations'] as const,
  mentorRequests: (eventId?: string) =>
    ['participants', 'me', 'mentor-requests', eventId ?? 'all'] as const,
};

export function useParticipantDashboard(enabled = true) {
  return useQuery({
    queryKey: participantKeys.dashboard,
    queryFn: getParticipantDashboard,
    enabled,
    staleTime: 30_000,
  });
}

export function useMyRegistrations(enabled = true) {
  return useQuery({
    queryKey: participantKeys.registrations,
    queryFn: getMyRegistrations,
    enabled,
  });
}

export function useMyRegisteredEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: participantKeys.event(eventId ?? ''),
    queryFn: () => getMyRegisteredEvent(eventId as string),
    enabled: Boolean(eventId),
    retry: 0,
  });
}

/** Only pending, non-expired invitations are returned by the backend. */
export function useMyTeamInvitations(enabled = true) {
  return useQuery({
    queryKey: participantKeys.teamInvitations,
    queryFn: getMyTeamInvitations,
    enabled,
  });
}

export function useMyMentorRequests(eventId?: string, enabled = true) {
  return useQuery({
    queryKey: participantKeys.mentorRequests(eventId),
    queryFn: () => getMyMentorRequests(eventId),
    enabled,
  });
}
