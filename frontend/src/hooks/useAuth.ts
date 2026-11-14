import { useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loginUser, registerUser } from '@/api/endpoints/auth';
import { getCurrentUser } from '@/api/endpoints/users';
import { setAccessToken, setUnauthorizedHandler } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import type { LoginRequest, RegisterRequest } from '@/api/types';

/**
 * Boot-time session hydration. Restores the token from localStorage, wires the
 * 401 interceptor to the store, and calls GET /users/me to confirm the token.
 * There is no refresh endpoint: an expired token simply ends the session.
 */
export function useAuthBootstrap(): void {
  const accessToken = useAuthStore((state) => state.accessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setBootstrapping = useAuthStore((state) => state.setBootstrapping);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!useAuthStore.getState().accessToken) return;
      clearSession();
      const next = `${window.location.pathname}${window.location.search}`;
      const loginUrl = `/login?next=${encodeURIComponent(next)}&expired=1`;
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign(loginUrl);
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!accessToken) {
        setAccessToken(null);
        setBootstrapping(false);
        return;
      }
      setAccessToken(accessToken);
      try {
        const user = await getCurrentUser();
        if (!cancelled) setUser(user);
      } catch {
        // The 401 interceptor already clears the session for invalid tokens.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
    // Re-run only when the token identity changes (sign-in / sign-out).
  }, [accessToken, setUser, setBootstrapping]);
}

/** POST /auth/login then hydrate the user through GET /users/me. */
export function useLogin() {
  const setToken = useAuthStore((state) => state.setToken);
  const setUser = useAuthStore((state) => state.setUser);
  const setBootstrapping = useAuthStore((state) => state.setBootstrapping);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      const token = await loginUser(body);
      return token;
    },
    onSuccess: async (token) => {
      queryClient.clear();
      setToken(token.access_token);
      setAccessToken(token.access_token);
      setBootstrapping(true);
      try {
        const user = await getCurrentUser();
        setUser(user);
      } finally {
        setBootstrapping(false);
      }
    },
  });
}

/** POST /auth/register returns the token AND the user in one response. */
export function useRegister() {
  const setToken = useAuthStore((state) => state.setToken);
  const setUser = useAuthStore((state) => state.setUser);
  const setBootstrapping = useAuthStore((state) => state.setBootstrapping);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: RegisterRequest) => registerUser(body),
    onSuccess: (response) => {
      queryClient.clear();
      setToken(response.access_token);
      setAccessToken(response.access_token);
      setUser(response.user);
      setBootstrapping(false);
    },
  });
}

/** Clears the token, the user, and every cached server response. */
export function useLogout(): () => void {
  const clearSession = useAuthStore((state) => state.clearSession);
  const queryClient = useQueryClient();

  return useCallback(() => {
    setAccessToken(null);
    clearSession();
    queryClient.clear();
  }, [clearSession, queryClient]);
}
