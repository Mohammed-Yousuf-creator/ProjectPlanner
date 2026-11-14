import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProject,
  getEventProjects,
  getTeamProject,
  type EventProjectParams,
} from '@/api/endpoints/projects';
import {
  createSubmission,
  getProjectSubmissions,
  submitSubmission,
  updateSubmission,
} from '@/api/endpoints/submissions';
import type {
  ProjectCreate,
  ProjectSubmissionCreate,
  ProjectSubmissionUpdate,
} from '@/api/types';

export const projectKeys = {
  team: (teamId: string) => ['team', teamId, 'project'] as const,
  event: (eventId: string, params: EventProjectParams) =>
    ['events', eventId, 'projects', params] as const,
  submissions: (projectId: string) => ['projects', projectId, 'submissions'] as const,
};

/**
 * GET /teams/{id}/project returns 404 when the team has no project yet - that is
 * an empty state, so retries are disabled and the 404 is handled by the caller.
 */
export function useTeamProject(teamId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.team(teamId ?? ''),
    queryFn: () => getTeamProject(teamId as string),
    enabled: Boolean(teamId),
    retry: 0,
  });
}

export function useEventProjects(eventId: string | undefined, params: EventProjectParams = {}) {
  return useQuery({
    queryKey: projectKeys.event(eventId ?? '', params),
    queryFn: () => getEventProjects(eventId as string, params),
    enabled: Boolean(eventId),
    retry: 0,
  });
}

export function useCreateProject(eventId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectCreate) => createProject(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.team(teamId) });
    },
  });
}

export function useProjectSubmissions(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.submissions(projectId ?? ''),
    queryFn: () => getProjectSubmissions(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useCreateSubmission(projectId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: ProjectSubmissionCreate) => createSubmission(projectId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.team(teamId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.submissions(projectId) });
    },
  });
}

export function useUpdateSubmission(projectId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      submissionId,
      body,
    }: {
      submissionId: string;
      body: ProjectSubmissionUpdate;
    }) => updateSubmission(projectId, submissionId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.team(teamId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.submissions(projectId) });
    },
  });
}

export function useSubmitSubmission(projectId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submissionId: string) => submitSubmission(projectId, submissionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.team(teamId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.submissions(projectId) });
    },
  });
}
