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

/**
 * Refresh plumbing.
 *
 * The store registers a refresher so this module does not import the store (that
 * would create a cycle: store → client → store). When a request 401s we call it
 * once, no matter how many requests failed together, then replay each failed
 * request with the new token.
 */
type Refresher = () => Promise<string | null>;
let refreshHandler: Refresher | null = null;
let inFlightRefresh: Promise<string | null> | null = null;

export function setRefreshHandler(handler: Refresher | null): void {
  refreshHandler = handler;
}

/** Only one refresh runs at a time; every concurrent 401 awaits the same one. */
function refreshAccessToken(): Promise<string | null> {
  if (!refreshHandler) return Promise.resolve(null);
  if (!inFlightRefresh) {
    inFlightRefresh = refreshHandler().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

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
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = config?.url ?? '';
    // A failed sign-in is a form error, not an expired session; refreshing on it
    // would loop forever because there is no valid session to renew.
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');
    const isRefreshEndpoint = url.includes('/auth/refresh');

    if (isAuthEndpoint || isRefreshEndpoint || config?._retried) {
      // Give up: refresh failed or this request already tried once.
      if (!isAuthEndpoint && !isRefreshEndpoint && unauthorizedHandler) {
        unauthorizedHandler('Session expired. Please sign in again.');
      }
      return Promise.reject(error);
    }

    const renewed = await refreshAccessToken();
    if (!renewed || !config) {
      unauthorizedHandler?.('Session expired. Please sign in again.');
      return Promise.reject(error);
    }

    // Publish the renewed token for the module too: the request interceptor
    // stamps `accessToken`, so without this the replay would go out with the
    // stale one it just replaced. The store's refresh handler also updates the
    // store; keeping the module variable in sync here makes replay independent
    // of how the handler was implemented.
    accessToken = renewed;

    // Replay the original request exactly once with the renewed token.
    config._retried = true;
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${renewed}`;
    return apiClient.request(config);
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
