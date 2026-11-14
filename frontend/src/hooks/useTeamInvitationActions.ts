import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptTeamInvitation, rejectTeamInvitation } from '@/api/endpoints/teams';
import { participantKeys } from './useParticipant';

/**
 * Accept/decline a team invitation and refresh every cache the result touches.
 * Shared by the invitations inbox and the team discovery page.
 */
export function useRespondToTeamInvitations() {
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
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      void queryClient.invalidateQueries({ queryKey: ['team'] });
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
