import { request } from '../client';
import type { UserMeResponse } from '../types';

/** GET /users/me - hydrates the authenticated user + profile. */
export function getCurrentUser(): Promise<UserMeResponse> {
  return request.get<UserMeResponse>('/users/me');
}
