import { request } from '../client';
import type { AuthResponse, LoginRequest, RegisterRequest, TokenResponse } from '../types';

/** POST /auth/register - creates the account, profile, and returns a token pair. */
export function registerUser(body: RegisterRequest): Promise<AuthResponse> {
  return request.post<AuthResponse>('/auth/register', body);
}

/** POST /auth/login - returns an access/refresh token pair. */
export function loginUser(body: LoginRequest): Promise<TokenResponse> {
  return request.post<TokenResponse>('/auth/login', body);
}

/**
 * POST /auth/refresh - exchanges a refresh token for a new pair (rotation).
 * Called by the axios 401 interceptor, not by components.
 */
export function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return request.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken });
}
