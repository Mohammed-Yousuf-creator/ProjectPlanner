/**
 * Registration availability mirrors the backend rules in
 * `app/services/registration_service.py`. The server stays authoritative; this is
 * only used to explain state and to avoid offering an impossible action.
 *
 * Accepted statuses: `published` or `registration_open`.
 * Blocked: draft, cancelled, completed (the API returns 400 for each).
 */
export type RegistrationAvailability =
  | { state: 'open' }
  | { state: 'not-open-yet'; opensAt: string | null }
  | { state: 'closed'; reason: string }
  | { state: 'unavailable'; reason: string };

export function getRegistrationAvailability(
  event:
    | {
        status: string;
        visibility: string;
        starts_at?: string | null;
        registration_opens_at?: string | null;
        registration_closes_at?: string | null;
      }
    | undefined,
  now: Date = new Date(),
): RegistrationAvailability {
  if (!event) return { state: 'unavailable', reason: 'Event not loaded.' };

  if (event.visibility !== 'public') {
    return { state: 'unavailable', reason: 'Registration is not available for private events.' };
  }
  if (event.status === 'draft') {
    return { state: 'unavailable', reason: 'Cannot register for draft events.' };
  }
  if (event.status === 'cancelled') {
    return { state: 'unavailable', reason: 'Cannot register for cancelled events.' };
  }
  if (event.status === 'completed') {
    return { state: 'unavailable', reason: 'Cannot register for completed events.' };
  }
  if (event.status !== 'published' && event.status !== 'registration_open') {
    return {
      state: 'unavailable',
      reason: `Registration is not open while the event is ${event.status.replace(/_/g, ' ')}.`,
    };
  }
  if (event.registration_opens_at && new Date(event.registration_opens_at) > now) {
    return { state: 'not-open-yet', opensAt: event.registration_opens_at };
  }
  if (event.registration_closes_at && new Date(event.registration_closes_at) < now) {
    return { state: 'closed', reason: 'Registration is closed.' };
  }
  if (event.starts_at && new Date(event.starts_at) < now) {
    return {
      state: 'closed',
      reason: 'Registration is closed because the event has already started.',
    };
  }
  return { state: 'open' };
}

/** Statuses that mean "this user currently holds a seat". */
export function isActiveRegistrationStatus(status: string | null | undefined): boolean {
  return status === 'registered' || status === 'approved' || status === 'waitlisted';
}

/** Team creation/discovery requires a registered or approved participant. */
export function canParticipateInTeams(status: string | null | undefined): boolean {
  return status === 'registered' || status === 'approved';
}

/** Withdrawal is allowed unless already withdrawn or rejected. */
export function canWithdraw(status: string | null | undefined): boolean {
  return isActiveRegistrationStatus(status);
}
