import { create } from 'zustand';
import type { UserMeResponse } from '../api/types';

const TOKEN_STORAGE_KEY = 'ep.access_token';

type AuthState = {
  /** JWT - the only thing persisted to localStorage. */
  accessToken: string | null;
  /** Hydrated from GET /users/me; null while loading or signed out. */
  user: UserMeResponse | null;
  /** True until the boot-time token check finishes. */
  bootstrapping: boolean;
  setToken: (token: string | null) => void;
  setUser: (user: UserMeResponse | null) => void;
  setBootstrapping: (value: boolean) => void;
  clearSession: () => void;
};

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: readStoredToken(),
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

  setUser: (user) => set({ user }),

  setBootstrapping: (value) => set({ bootstrapping: value }),

  clearSession: () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ accessToken: null, user: null, bootstrapping: false });
  },
}));

/** Convenience selectors used across the app. */
export const selectIsAuthenticated = (state: AuthState) => Boolean(state.accessToken);

export function getDisplayName(user: UserMeResponse | null): string {
  if (!user) return 'there';
  return user.profile?.display_name?.trim() || user.username;
}
