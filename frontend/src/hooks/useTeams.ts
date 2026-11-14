import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptTeamInvitation,
  createTeam,
  disbandTeam,
  getEventTeams,
  getTeam,
  inviteToTeam,
  joinTeam,
  leaveTeam,
  rejectTeamInvitation,
  removeTeamMember,
  transferTeamOwnership,
  updateTeamMemberRole,
  type TeamListParams,
} from '@/api/endpoints/teams';
import type {
  TeamCreateRequest,
  TeamInviteCreateRequest,
  TeamJoinRequest,
  TeamMemberRoleUpdateRequest,
  TeamTransferOwnershipRequest,
} from '@/api/types';
import { participantKeys } from './useParticipant';

export const teamKeys = {
  all: ['teams'] as const,
  list: (eventId: string, params: TeamListParams) =>
    ['events', eventId, 'teams', params] as const,
  detail: (teamId: string) => ['teams', teamId] as const,
  members: (teamId: string) => ['teams', teamId, 'members'] as const,
};

/**
 * GET /events/{id}/teams is restricted to registered/approved participants -
 * a 403 is an expected state, not a bug, so the page renders a registration
 * prompt instead of a generic error.
 */
export function useEventTeams(eventId: string | undefined, params: TeamListParams = {}) {
  return useQuery({
    queryKey: teamKeys.list(eventId ?? '', params),
    queryFn: () => getEventTeams(eventId as string, params),
    enabled: Boolean(eventId),
    retry: 0,
  });
}

export function useTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.detail(teamId ?? ''),
    queryFn: () => getTeam(teamId as string),
    enabled: Boolean(teamId),
    retry: 0,
  });
}

export function useCreateTeam(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamCreateRequest) => createTeam(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'teams'] });
    },
  });
}

export function useJoinTeam(eventId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamJoinRequest) => joinTeam(teamId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'teams'] });
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}

export function useInviteToTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamInviteCreateRequest) => inviteToTeam(teamId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}

export function useRespondToTeamInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invitationId,
      action,
    }: {
      invitationId: string;
      action: 'accept' | 'reject';
    }) =>
      action === 'accept'
        ? acceptTeamInvitation(invitationId)
        : rejectTeamInvitation(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: participantKeys.teamInvitations });
      void queryClient.invalidateQueries({ queryKey: participantKeys.dashboard });
    },
  });
}

export function useLeaveTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => leaveTeam(teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

export function useRemoveTeamMember(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}

export function useUpdateTeamMemberRole(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: TeamMemberRoleUpdateRequest }) =>
      updateTeamMemberRole(teamId, userId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}

export function useTransferOwnership(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamTransferOwnershipRequest) => transferTeamOwnership(teamId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
    },
  });
}

export function useDisbandTeam(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => disbandTeam(teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) });
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}
