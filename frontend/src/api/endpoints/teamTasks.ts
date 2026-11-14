import { cleanParams, request } from '../client';
import type {
  TeamTaskAssigneesUpdateRequest,
  TeamTaskCreateRequest,
  TeamTaskRead,
  TeamTaskUpdateRequest,
} from '../types';

export type TeamTaskListParams = {
  status?: string;
  priority?: string;
  assignee_id?: string;
  limit?: number;
  offset?: number;
};

export function createTeamTask(
  teamId: string,
  body: TeamTaskCreateRequest,
): Promise<TeamTaskRead> {
  return request.post<TeamTaskRead>(`/teams/${teamId}/tasks`, body);
}

export function getTeamTasks(
  teamId: string,
  params: TeamTaskListParams = {},
): Promise<TeamTaskRead[]> {
  return request.get<TeamTaskRead[]>(`/teams/${teamId}/tasks`, { params: cleanParams(params) });
}

export function getTeamTask(teamId: string, taskId: string): Promise<TeamTaskRead> {
  return request.get<TeamTaskRead>(`/teams/${teamId}/tasks/${taskId}`);
}

export function updateTeamTask(
  teamId: string,
  taskId: string,
  body: TeamTaskUpdateRequest,
): Promise<TeamTaskRead> {
  return request.patch<TeamTaskRead>(`/teams/${teamId}/tasks/${taskId}`, body);
}

export function deleteTeamTask(teamId: string, taskId: string): Promise<void> {
  return request.delete<void>(`/teams/${teamId}/tasks/${taskId}`);
}

export function setTeamTaskAssignees(
  teamId: string,
  taskId: string,
  body: TeamTaskAssigneesUpdateRequest,
): Promise<TeamTaskRead> {
  return request.put<TeamTaskRead>(`/teams/${teamId}/tasks/${taskId}/assignees`, body);
}
