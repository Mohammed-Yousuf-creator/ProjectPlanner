import axios, { type AxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/**
 * Single axios instance for the whole app.
 *
 * Every URL is relative (`/api/v1/...`) so the Vite dev proxy keeps the browser
 * on one origin - the backend ships no CORS middleware.
 */
export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { Accept: 'application/json' },
  timeout: 30_000,
});

/** In-memory access token; the auth store is the only writer. */
let accessToken: string | null = null;
let unauthorizedHandler: ((message: string) => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered once by the auth bootstrap so a 401 can clear the session. */
export function setUnauthorizedHandler(handler: ((message: string) => void) | null): void {
  unauthorizedHandler = handler;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      // A failed sign-in is a form error, not an expired session.
      const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register');
      if (!isAuthAttempt && unauthorizedHandler) {
        unauthorizedHandler('Session expired. Please sign in again.');
      }
    }
    return Promise.reject(error);
  },
);

type RequestOptions = Omit<AxiosRequestConfig, 'url' | 'method' | 'baseURL'>;

const request = {
  get: <T>(url: string, options?: RequestOptions) =>
    apiClient.get<T>(url, options).then((r) => r.data),

  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    apiClient.post<T>(url, body, options).then((r) => r.data),

  put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    apiClient.put<T>(url, body, options).then((r) => r.data),

  patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    apiClient.patch<T>(url, body, options).then((r) => r.data),

  delete: <T = void>(url: string, options?: RequestOptions) =>
    apiClient.delete<T>(url, options).then((r) => r.data),

  /** Binary download; callers create/revoke the object URL themselves. */
  blob: (url: string, options?: RequestOptions) =>
    apiClient.get<Blob>(url, { ...options, responseType: 'blob' }).then((r) => r.data),
};

export { request };

/**
 * Strips empty values from a query param object so the URL never contains
 * `?city=&format=` noise.
 */
export function cleanParams<T extends Record<string, unknown>>(params: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = value;
  }
  return result;
}
