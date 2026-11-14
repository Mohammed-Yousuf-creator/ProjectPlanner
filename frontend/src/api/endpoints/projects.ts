import { cleanParams, request } from '../client';
import type { ProjectCreate, ProjectDetailRead, ProjectPublicRead } from '../types';

export function createProject(eventId: string, body: ProjectCreate): Promise<ProjectDetailRead> {
  return request.post<ProjectDetailRead>(`/events/${eventId}/projects`, body);
}

/** GET /teams/{id}/project - project + submission history for active members. */
export function getTeamProject(teamId: string): Promise<ProjectDetailRead> {
  return request.get<ProjectDetailRead>(`/teams/${teamId}/project`);
}

export type EventProjectParams = { page?: number; page_size?: number };

/** GET /events/{id}/projects - submitted projects only (auth required). */
export function getEventProjects(
  eventId: string,
  params: EventProjectParams = {},
): Promise<ProjectPublicRead[]> {
  return request.get<ProjectPublicRead[]>(`/events/${eventId}/projects`, {
    params: cleanParams(params),
  });
}
