import { cleanParams, request } from '../client';
import type {
  EventRegisterRequest,
  EventRegistrationResponse,
  OrganizerParticipantRead,
  ParticipantStatusUpdateRequest,
} from '../types';

/**
 * POST /events/{id}/register - registers or reactivates a withdrawn registration.
 * The body is optional; `registration_data` is only meaningful when the organiser
 * has described custom questions, which the backend cannot currently express.
 */
export function registerForEvent(
  eventId: string,
  body?: EventRegisterRequest,
): Promise<EventRegistrationResponse> {
  return request.post<EventRegistrationResponse>(`/events/${eventId}/register`, body ?? {});
}

export function withdrawFromEvent(eventId: string): Promise<EventRegistrationResponse> {
  return request.post<EventRegistrationResponse>(`/events/${eventId}/withdraw`);
}

export type EventParticipantParams = {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

/** GET /events/{id}/participants - organiser roster (owner/admin only). */
export function getEventParticipants(
  eventId: string,
  params: EventParticipantParams = {},
): Promise<OrganizerParticipantRead[]> {
  return request.get<OrganizerParticipantRead[]>(`/events/${eventId}/participants`, {
    params: cleanParams(params),
  });
}

export function updateParticipantStatus(
  eventId: string,
  userId: string,
  body: ParticipantStatusUpdateRequest,
): Promise<EventRegistrationResponse> {
  return request.patch<EventRegistrationResponse>(
    `/events/${eventId}/participants/${userId}`,
    body,
  );
}
