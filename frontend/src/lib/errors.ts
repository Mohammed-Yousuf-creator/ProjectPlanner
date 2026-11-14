import { AxiosError, isAxiosError } from 'axios';

/**
 * Narrowest possible view of a JSON body we might receive on an error.
 * FastAPI sends `detail` as a string for 4xx domain errors and as an array of
 * `{loc, msg, type}` objects for 422 validation errors.
 */
type FastApiValidationItem = {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
};

export type FieldErrors = Record<string, string>;

export type ApiError = {
  status: number | null;
  message: string;
  fieldErrors: FieldErrors;
  isNetworkError: boolean;
  raw: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readValidationItems(detail: unknown): FastApiValidationItem[] | null {
  if (!Array.isArray(detail)) return null;
  return detail.filter(isRecord) as FastApiValidationItem[];
}

function fieldNameFromLoc(loc: (string | number)[] | undefined): string | null {
  if (!loc || loc.length === 0) return null;
  for (let i = loc.length - 1; i >= 0; i -= 1) {
    const part = loc[i];
    if (typeof part === 'string' && part !== 'body' && part !== 'query' && part !== 'path') {
      return part;
    }
  }
  return null;
}

/**
 * Turn any thrown value into a display-safe message plus per-field messages.
 *
 * Handles:
 *  - FastAPI string detail  -> `{"detail": "Registration is closed"}`
 *  - FastAPI 422 array      -> `{"detail": [{"loc": ["body","email"], "msg": "..."}]}`
 *  - network failures       -> Axios has no response at all
 *  - everything else        -> a neutral fallback
 */
export function toApiError(error: unknown): ApiError {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>;
    const response = axiosError.response;

    if (!response) {
      return {
        status: null,
        message:
          axiosError.code === 'ECONNABORTED'
            ? 'The request timed out. Please try again.'
            : 'Cannot reach the server. Check that the backend is running and try again.',
        fieldErrors: {},
        isNetworkError: true,
        raw: error,
      };
    }

    const status = response.status;
    const body = response.data;
    const fieldErrors: FieldErrors = {};

    let message = '';

    if (isRecord(body)) {
      const detail = body.detail;
      const validationItems = readValidationItems(detail);

      if (validationItems && validationItems.length > 0) {
        const messages: string[] = [];
        for (const item of validationItems) {
          const msg = item.msg ?? 'Invalid value';
          const field = fieldNameFromLoc(item.loc);
          if (field && !fieldErrors[field]) fieldErrors[field] = msg;
          messages.push(field ? `${field}: ${msg}` : msg);
        }
        message = messages.join('; ');
      } else if (typeof detail === 'string' && detail.trim().length > 0) {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = 'The submitted data is invalid.';
      }
    } else if (typeof body === 'string' && body.trim().length > 0) {
      message = body;
    }

    if (!message) {
      message =
        status === 401
          ? 'Your session is invalid or has expired. Please sign in again.'
          : status === 403
            ? "You don't have permission to perform this action."
            : status === 404
              ? 'The requested resource was not found.'
              : status === 409
                ? 'This action conflicts with the current state.'
                : status >= 500
                  ? 'The server hit an unexpected error. Please try again.'
                  : 'The request failed. Please try again.';
    }

    return { status, message, fieldErrors, isNetworkError: false, raw: error };
  }

  if (error instanceof Error) {
    return {
      status: null,
      message: error.message,
      fieldErrors: {},
      isNetworkError: false,
      raw: error,
    };
  }

  return {
    status: null,
    message: 'Something went wrong. Please try again.',
    fieldErrors: {},
    isNetworkError: false,
    raw: error,
  };
}

/** Convenience for places that only need the human-readable string. */
export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}

/** True when an error should be shown with the red danger treatment. */
export function isAuthError(error: unknown): boolean {
  return toApiError(error).status === 401;
}
