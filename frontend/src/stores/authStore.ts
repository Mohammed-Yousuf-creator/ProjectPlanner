import { create } from 'zustand';
import type { UserMeResponse } from '../api/types';

const TOKEN_STORAGE_KEY = 'ep.access_token';
const REFRESH_STORAGE_KEY = 'ep.refresh_token';

type AuthState = {
  /** Short-lived JWT (30 min); persisted to localStorage. */
  accessToken: string | null;
  /** Long-lived, exchange-only JWT; persisted so a reload keeps the session. */
  refreshToken: string | null;
  /** Hydrated from GET /users/me; null while loading or signed out. */
  user: UserMeResponse | null;
  /** True until the boot-time token check finishes. */
  bootstrapping: boolean;
  setToken: (token: string | null) => void;
  /** Store both halves of a fresh token pair. */
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: UserMeResponse | null) => void;
  setBootstrapping: (value: boolean) => void;
  clearSession: () => void;
};

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: readStored(TOKEN_STORAGE_KEY),
  refreshToken: readStored(REFRESH_STORAGE_KEY),
  user: null,
  bootstrapping: true,

  setToken: (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
      else localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Private-mode browsers can throw; the in-memory token still works.
    }
    set({ accessToken: token });
  },

  setTokens: (accessToken, refreshToken) => {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
      localStorage.setItem(REFRESH_STORAGE_KEY, refreshToken);
    } catch {
      // Private-mode browsers can throw; the in-memory tokens still work.
    }
    set({ accessToken, refreshToken });
  },

  setUser: (user) => set({ user }),

  setBootstrapping: (value) => set({ bootstrapping: value }),

  clearSession: () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ accessToken: null, refreshToken: null, user: null, bootstrapping: false });
  },
}));

/** Convenience selectors used across the app. */
export const selectIsAuthenticated = (state: AuthState) => Boolean(state.accessToken);

export function getDisplayName(user: UserMeResponse | null): string {
  if (!user) return 'there';
  return user.profile?.display_name?.trim() || user.username;
}
