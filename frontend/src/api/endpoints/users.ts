import { request } from '../client';
import type { EventRead, UserMeResponse } from '../types';

/** GET /users/me - hydrates the authenticated user + profile. */
export function getCurrentUser(): Promise<UserMeResponse> {
  return request.get<UserMeResponse>('/users/me');
}

/** GET /users/me/judging-events - events where the caller has judging access. */
export function getMyJudgingEvents(): Promise<EventRead[]> {
  return request.get<EventRead[]>('/users/me/judging-events');
}

/** GET /users/me/mentoring-events - distinct events the caller mentors. */
export function getMyMentoringEvents(): Promise<EventRead[]> {
  return request.get<EventRead[]>('/users/me/mentoring-events');
}
