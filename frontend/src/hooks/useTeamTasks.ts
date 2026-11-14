import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTeamTask,
  deleteTeamTask,
  getTeamTask,
  getTeamTasks,
  setTeamTaskAssignees,
  updateTeamTask,
  type TeamTaskListParams,
} from '@/api/endpoints/teamTasks';
import type {
  TeamTaskAssigneesUpdateRequest,
  TeamTaskCreateRequest,
  TeamTaskUpdateRequest,
} from '@/api/types';
import { teamKeys } from './useTeams';

export const taskKeys = {
  list: (teamId: string, params: TeamTaskListParams) =>
    ['team', teamId, 'tasks', params] as const,
  detail: (teamId: string, taskId: string) => ['team', teamId, 'tasks', taskId] as const,
};

/**
 * The board renders all four status columns from one unfiltered fetch and groups
 * client-side; the API returns rows ordered by `position` ascending.
 */
export function useTeamTasks(teamId: string | undefined, params: TeamTaskListParams = {}) {
  return useQuery({
    queryKey: taskKeys.list(teamId ?? '', params),
    queryFn: () => getTeamTasks(teamId as string, { limit: 100, ...params }),
    enabled: Boolean(teamId),
  });
}

export function useTeamTask(teamId: string, taskId: string | null) {
  return useQuery({
    queryKey: taskKeys.detail(teamId, taskId ?? ''),
    queryFn: () => getTeamTask(teamId, taskId as string),
    enabled: Boolean(taskId),
  });
}

export function useCreateTeamTask(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamTaskCreateRequest) => createTeamTask(teamId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', teamId, 'tasks'] });
    },
  });
}

export function useUpdateTeamTask(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: TeamTaskUpdateRequest }) =>
      updateTeamTask(teamId, taskId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', teamId, 'tasks'] });
    },
  });
}

export function useDeleteTeamTask(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTeamTask(teamId, taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', teamId, 'tasks'] });
    },
  });
}

export function useSetTaskAssignees(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      body,
    }: {
      taskId: string;
      body: TeamTaskAssigneesUpdateRequest;
    }) => setTeamTaskAssignees(teamId, taskId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', teamId, 'tasks'] });
    },
  });
}

export { teamKeys };
