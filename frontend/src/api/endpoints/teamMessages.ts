import { cleanParams, request } from '../client';
import type {
  TeamMessageCreateRequest,
  TeamMessageRead,
  TeamMessageUpdateRequest,
} from '../types';

export type TeamMessageListParams = { limit?: number; offset?: number };

export function createTeamMessage(
  teamId: string,
  body: TeamMessageCreateRequest,
): Promise<TeamMessageRead> {
  return request.post<TeamMessageRead>(`/teams/${teamId}/messages`, body);
}

/** Chronological (oldest first) history with limit/offset pagination. */
export function getTeamMessages(
  teamId: string,
  params: TeamMessageListParams = {},
): Promise<TeamMessageRead[]> {
  return request.get<TeamMessageRead[]>(`/teams/${teamId}/messages`, {
    params: cleanParams(params),
  });
}

export function updateTeamMessage(
  teamId: string,
  messageId: string,
  body: TeamMessageUpdateRequest,
): Promise<TeamMessageRead> {
  return request.patch<TeamMessageRead>(`/teams/${teamId}/messages/${messageId}`, body);
}

export function deleteTeamMessage(teamId: string, messageId: string): Promise<void> {
  return request.delete<void>(`/teams/${teamId}/messages/${messageId}`);
}
