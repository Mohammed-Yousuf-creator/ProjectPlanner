import { request } from '../client';
import type { AuthResponse, LoginRequest, RegisterRequest, TokenResponse } from '../types';

/** POST /auth/register - creates the account, profile, and returns a token + user. */
export function registerUser(body: RegisterRequest): Promise<AuthResponse> {
  return request.post<AuthResponse>('/auth/register', body);
}

/** POST /auth/login - returns the access token only (no refresh token exists). */
export function loginUser(body: LoginRequest): Promise<TokenResponse> {
  return request.post<TokenResponse>('/auth/login', body);
}
