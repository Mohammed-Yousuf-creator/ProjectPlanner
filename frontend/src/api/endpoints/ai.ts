import { cleanParams, request } from '../client';
import type {
  AiStatusRead,
  ChatConversationRead,
  ChatConversationSummaryRead,
  ChatSendResponse,
  EventOverviewResponse,
  SkillCreate,
  SkillRead,
  SubmissionSummaryRead,
  TeamMatchResponse,
  TeammateMatchResponse,
} from '../types';

/* ------------------------------ capability ------------------------------ */

/** GET /ai/status - which AI features are live on this server. */
export function getAiStatus(): Promise<AiStatusRead> {
  return request.get<AiStatusRead>('/ai/status');
}

/* -------------------------------- skills -------------------------------- */

/** GET /users/me/skills */
export function getMySkills(): Promise<SkillRead[]> {
  return request.get<SkillRead[]>('/users/me/skills');
}

/** PUT /users/me/skills - whole-set replacement. */
export function replaceMySkills(skills: SkillCreate[]): Promise<SkillRead[]> {
  return request.put<SkillRead[]>('/users/me/skills', { skills });
}

/** GET /users/{id}/skills */
export function getUserSkills(userId: string): Promise<SkillRead[]> {
  return request.get<SkillRead[]>(`/users/${userId}/skills`);
}

/* ------------------------------ matchmaking ----------------------------- */

/** GET /events/{id}/matchmaking/teammates */
export function getTeammateMatches(
  eventId: string,
  limit = 10,
): Promise<TeammateMatchResponse> {
  return request.get<TeammateMatchResponse>(
    `/events/${eventId}/matchmaking/teammates`,
    { params: cleanParams({ limit }) },
  );
}

/** GET /events/{id}/matchmaking/teams */
export function getTeamMatches(eventId: string, limit = 10): Promise<TeamMatchResponse> {
  return request.get<TeamMatchResponse>(`/events/${eventId}/matchmaking/teams`, {
    params: cleanParams({ limit }),
  });
}

/** POST /events/{id}/matchmaking/preview - match a pasted skill list. */
export function previewTeammateMatches(
  eventId: string,
  skills: string[],
  limit = 10,
): Promise<TeammateMatchResponse> {
  return request.post<TeammateMatchResponse>(
    `/events/${eventId}/matchmaking/preview`,
    { skills, limit },
  );
}

/* --------------------------------- chat --------------------------------- */

/** GET /ai/conversations */
export function listConversations(): Promise<ChatConversationSummaryRead[]> {
  return request.get<ChatConversationSummaryRead[]>('/ai/conversations');
}

/** POST /ai/conversations */
export function createConversation(eventId?: string): Promise<ChatConversationRead> {
  return request.post<ChatConversationRead>(
    '/ai/conversations',
    undefined,
    { params: cleanParams({ event_id: eventId }) },
  );
}

/** GET /ai/conversations/{id} */
export function getConversation(conversationId: string): Promise<ChatConversationRead> {
  return request.get<ChatConversationRead>(`/ai/conversations/${conversationId}`);
}

/** DELETE /ai/conversations/{id} */
export function deleteConversation(conversationId: string): Promise<void> {
  return request.delete<void>(`/ai/conversations/${conversationId}`);
}

/** POST /ai/conversations/{id}/messages */
export function sendConversationMessage(
  conversationId: string,
  message: string,
  eventId?: string,
): Promise<ChatSendResponse> {
  return request.post<ChatSendResponse>(`/ai/conversations/${conversationId}/messages`, {
    message,
    event_id: eventId ?? null,
  });
}

/** POST /ai/chat - one-shot, creating a conversation when needed. */
export function sendChatMessage(
  message: string,
  eventId?: string,
): Promise<ChatSendResponse> {
  return request.post<ChatSendResponse>('/ai/chat', {
    message,
    event_id: eventId ?? null,
  });
}

/* ------------------------------- summaries ------------------------------ */

/** GET /submissions/{id}/summary */
export function getSubmissionSummary(
  submissionId: string,
  refresh = false,
): Promise<SubmissionSummaryRead> {
  return request.get<SubmissionSummaryRead>(`/submissions/${submissionId}/summary`, {
    params: cleanParams({ refresh: refresh ? true : undefined }),
  });
}

/** GET /events/{id}/ai/overview - organizer-only digest. */
export function getEventOverview(
  eventId: string,
  refresh = false,
): Promise<EventOverviewResponse> {
  return request.get<EventOverviewResponse>(`/events/${eventId}/ai/overview`, {
    params: cleanParams({ refresh: refresh ? true : undefined }),
  });
}
