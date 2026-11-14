import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { RegistrationButton } from '@/components/domain/RegistrationButton';
import { renderWithProviders } from '@/test/renderWithProviders';
import { makeEvent } from '@/test/factories';
import { useAuthStore } from '@/stores/authStore';
import * as registrationEndpoints from '@/api/endpoints/registrations';

/**
 * PLAN.md §14 test 5: the register button must handle success (200/201), an
 * "already registered" conflict (409) and a validation/domain rejection (400).
 */

vi.mock('@/api/endpoints/registrations', async () => {
  const actual =
    await vi.importActual<typeof import('@/api/endpoints/registrations')>(
      '@/api/endpoints/registrations',
    );
  return {
    ...actual,
    registerForEvent: vi.fn(),
    withdrawFromEvent: vi.fn(),
  };
});

const OPEN_EVENT = makeEvent();

function apiError(status: number, detail: string): AxiosError {
  const response = {
    status,
    statusText: '',
    data: { detail },
    headers: {},
    config: { url: `/events/${OPEN_EVENT.id}/registrations`, headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', { url: '/registrations' } as never, undefined, response);
}

function signIn() {
  useAuthStore.setState({ accessToken: 'test-token', user: null, bootstrapping: false });
}

describe('RegistrationButton', () => {
  beforeEach(() => {
    signIn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ accessToken: null, user: null, bootstrapping: false });
  });

  it('asks signed-out visitors to sign in instead of registering', () => {
    useAuthStore.setState({ accessToken: null, user: null, bootstrapping: false });

    renderWithProviders(<RegistrationButton event={OPEN_EVENT} />);

    expect(screen.getByRole('button', { name: 'Sign in to register' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Register for this event/i })).not.toBeInTheDocument();
  });

  it('registers successfully and reports it with a toast', async () => {
    vi.mocked(registrationEndpoints.registerForEvent).mockResolvedValue({
      id: 'reg-1',
      status: 'registered',
    } as never);

    renderWithProviders(<RegistrationButton event={OPEN_EVENT} />);

    await userEvent.click(screen.getByRole('button', { name: /Register for this event/i }));

    await waitFor(() => {
      expect(registrationEndpoints.registerForEvent).toHaveBeenCalledTimes(1);
      expect(vi.mocked(registrationEndpoints.registerForEvent).mock.calls[0][0]).toBe(
        OPEN_EVENT.id,
      );
    });
    // The mutation resolves without an inline error and the CTA returns to idle.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Register for this event/i })).toBeEnabled();
    });
    expect(
      screen.queryByText('You are already registered for this event.'),
    ).not.toBeInTheDocument();
  });

  it('shows the server message on a 409 conflict without crashing', async () => {
    vi.mocked(registrationEndpoints.registerForEvent).mockRejectedValue(
      apiError(409, 'You are already registered for this event.'),
    );

    renderWithProviders(<RegistrationButton event={OPEN_EVENT} />);

    await userEvent.click(screen.getByRole('button', { name: /Register for this event/i }));

    expect(
      await screen.findByText('You are already registered for this event.'),
    ).toBeInTheDocument();
    // The primary action stays available so the user can retry after the state changes.
    expect(screen.getByRole('button', { name: /Register for this event/i })).toBeEnabled();
  });

  it('surfaces a 400 domain rejection inline', async () => {
    vi.mocked(registrationEndpoints.registerForEvent).mockRejectedValue(
      apiError(400, 'Registration is closed for this event.'),
    );

    renderWithProviders(<RegistrationButton event={OPEN_EVENT} />);

    await userEvent.click(screen.getByRole('button', { name: /Register for this event/i }));

    expect(await screen.findByText('Registration is closed for this event.')).toBeInTheDocument();
  });

  it('shows the registered state instead of the register button when already registered', () => {
    renderWithProviders(<RegistrationButton event={OPEN_EVENT} registrationStatus="registered" />);

    expect(screen.getByText('You are registered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Register for this event/i })).not.toBeInTheDocument();
  });

  it('explains a rejected registration and never offers the button again', () => {
    renderWithProviders(<RegistrationButton event={OPEN_EVENT} registrationStatus="rejected" />);

    expect(screen.getByText('Registration rejected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Register for this event/i })).not.toBeInTheDocument();
  });

  it('disables registration before the window opens', () => {
    const futureEvent = makeEvent({
      registration_opens_at: '2099-01-01T00:00:00Z',
      registration_closes_at: '2099-02-01T00:00:00Z',
      status: 'published',
    });

    renderWithProviders(<RegistrationButton event={futureEvent} />);

    expect(screen.getByRole('button', { name: 'Registration unavailable' })).toBeDisabled();
    expect(screen.getByText(/Registration opens/i)).toBeInTheDocument();
  });
});
