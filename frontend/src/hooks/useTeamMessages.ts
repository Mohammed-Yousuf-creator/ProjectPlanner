import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTeamMessage,
  deleteTeamMessage,
  getTeamMessages,
  updateTeamMessage,
  type TeamMessageListParams,
} from '@/api/endpoints/teamMessages';
import type { TeamMessageCreateRequest, TeamMessageUpdateRequest } from '@/api/types';

export const messageKeys = {
  all: (teamId: string) => ['team', teamId, 'messages'] as const,
  list: (teamId: string, params: TeamMessageListParams) =>
    ['team', teamId, 'messages', params] as const,
};

export function useTeamMessages(teamId: string | undefined, params: TeamMessageListParams = {}) {
  return useQuery({
    queryKey: messageKeys.list(teamId ?? '', { limit: 50, ...params }),
    queryFn: () => getTeamMessages(teamId as string, { limit: 50, ...params }),
    enabled: Boolean(teamId),
  });
}

export function useCreateTeamMessage(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamMessageCreateRequest) => createTeamMessage(teamId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all(teamId) });
    },
  });
}

export function useUpdateTeamMessage(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: TeamMessageUpdateRequest }) =>
      updateTeamMessage(teamId, messageId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all(teamId) });
    },
  });
}

export function useDeleteTeamMessage(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteTeamMessage(teamId, messageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all(teamId) });
    },
  });
}
