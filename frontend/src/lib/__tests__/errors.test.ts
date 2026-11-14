import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { toApiError, errorMessage } from '@/lib/errors';

/**
 * PLAN.md §14 test 2: string `detail` and 422 array `detail` both produce a
 * readable message, and 422s also produce per-field messages.
 */

function axiosErrorWith(status: number, data: unknown, url = '/events'): AxiosError {
  const response = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { url, headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', { url } as never, undefined, response);
}

describe('toApiError', () => {
  it('uses a string detail verbatim', () => {
    const error = toApiError(axiosErrorWith(409, { detail: 'You are already registered.' }));

    expect(error.status).toBe(409);
    expect(error.message).toBe('You are already registered.');
    expect(error.fieldErrors).toEqual({});
    expect(error.isNetworkError).toBe(false);
  });

  it('flattens a 422 detail array into a message plus field errors', () => {
    const error = toApiError(
      axiosErrorWith(422, {
        detail: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' },
          { loc: ['body', 'password'], msg: 'ensure this value has at least 8 characters', type: 'value_error' },
        ],
      }),
    );

    expect(error.status).toBe(422);
    expect(error.fieldErrors.email).toBe('value is not a valid email address');
    expect(error.fieldErrors.password).toBe('ensure this value has at least 8 characters');
    expect(error.message).toContain('email:');
    expect(error.message).toContain('password:');
  });

  it('ignores the body/query/path prefixes when naming the field', () => {
    const error = toApiError(
      axiosErrorWith(422, {
        detail: [{ loc: ['query', 'limit'], msg: 'ensure this value is less than or equal to 100' }],
      }),
    );

    expect(error.fieldErrors.limit).toBe('ensure this value is less than or equal to 100');
  });

  it('falls back to a status-specific message when detail is absent', () => {
    expect(toApiError(axiosErrorWith(403, {})).message).toBe(
      "You don't have permission to perform this action.",
    );
    expect(toApiError(axiosErrorWith(500, {})).message).toBe(
      'The server hit an unexpected error. Please try again.',
    );
  });

  it('reports a network failure when there is no response', () => {
    const networkError = new AxiosError('Network Error', 'ERR_NETWORK');
    const error = toApiError(networkError);

    expect(error.isNetworkError).toBe(true);
    expect(error.status).toBeNull();
    expect(error.message).toContain('Cannot reach the server');
  });

  it('reports a timeout distinctly from a network failure', () => {
    const error = toApiError(new AxiosError('timeout', 'ECONNABORTED'));
    expect(error.message).toContain('timed out');
  });

  it('handles non-axios values without throwing', () => {
    expect(toApiError(new Error('boom')).message).toBe('boom');
    expect(toApiError('nope').message).toBe('Something went wrong. Please try again.');
    expect(toApiError(null).message).toBe('Something went wrong. Please try again.');
  });
});

describe('errorMessage', () => {
  it('returns just the human-readable string', () => {
    expect(errorMessage(axiosErrorWith(404, { detail: 'Event not found' }))).toBe('Event not found');
  });
});
