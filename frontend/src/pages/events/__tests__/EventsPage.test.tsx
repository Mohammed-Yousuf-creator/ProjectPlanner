import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { EventsPage } from '@/pages/events/EventsPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { makeEvent } from '@/test/factories';
import * as eventsApi from '@/api/endpoints/events';

/**
 * PLAN.md §14 test 4: filters update the URL *and* the request parameters.
 * The API layer is mocked so the assertions are about the query string the
 * discovery page builds, not about HTTP plumbing.
 */

vi.mock('@/api/endpoints/events', () => ({
  getEvents: vi.fn(),
  getEvent: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

describe('EventsPage filters', () => {
  beforeEach(() => {
    vi.mocked(eventsApi.getEvents).mockResolvedValue([makeEvent()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requests the default page without filters', async () => {
    renderWithProviders(
      <>
        <EventsPage />
        <LocationProbe />
      </>,
    );

    await waitFor(() => expect(eventsApi.getEvents).toHaveBeenCalled());
    expect(eventsApi.getEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 12, offset: 0 }),
    );
    expect(await screen.findByText('Winter Build Sprint')).toBeInTheDocument();
  });

  it('puts the chosen format in the URL and in the request params', async () => {
    renderWithProviders(
      <>
        <EventsPage />
        <LocationProbe />
      </>,
    );

    await userEvent.selectOptions(screen.getByLabelText('Format'), 'hybrid');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/?format=hybrid');
    });
    await waitFor(() => {
      expect(eventsApi.getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ format: 'hybrid', offset: 0 }),
      );
    });
  });

  it('reads existing filters out of the URL on first render', async () => {
    renderWithProviders(
      <>
        <EventsPage />
        <LocationProbe />
      </>,
      { route: '/?event_type=conference&city=Pune&offset=12' },
    );

    await waitFor(() => {
      expect(eventsApi.getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ event_type: 'conference', city: 'Pune', offset: 12 }),
      );
    });
    expect(screen.getByLabelText('City')).toHaveValue('Pune');
  });

  it('debounces the city box before touching the URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(
      <>
        <EventsPage />
        <LocationProbe />
      </>,
    );

    await userEvent.type(screen.getByLabelText('City'), 'Mum');

    // Nothing has been committed yet because the debounce has not elapsed.
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);

    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('city=Mum');
    });

    vi.useRealTimers();
  });

  it('clears every filter with Reset', async () => {
    renderWithProviders(
      <>
        <EventsPage />
        <LocationProbe />
      </>,
      { route: '/?format=online&event_type=meetup' },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    });
  });
});
