import { cleanParams, request } from '../client';
import type {
  MentorRequestAssign,
  MentorRequestCreate,
  MentorRequestRead,
  MentorRequestStatusUpdate,
} from '../types';

export function createMentorRequest(
  eventId: string,
  body: MentorRequestCreate,
): Promise<MentorRequestRead> {
  return request.post<MentorRequestRead>(`/events/${eventId}/mentor-requests`, body);
}

/** Note: this endpoint pages with 1-based `page` + `page_size`, not limit/offset. */
export function getEventMentorRequests(
  eventId: string,
  params: { status?: string; priority?: string; page?: number; page_size?: number } = {},
): Promise<MentorRequestRead[]> {
  return request.get<MentorRequestRead[]>(`/events/${eventId}/mentor-requests`, {
    params: cleanParams(params),
  });
}

export function assignMentorRequest(
  requestId: string,
  body: MentorRequestAssign,
): Promise<MentorRequestRead> {
  return request.patch<MentorRequestRead>(`/mentor-requests/${requestId}/assign`, body);
}

export function updateMentorRequestStatus(
  requestId: string,
  body: MentorRequestStatusUpdate,
): Promise<MentorRequestRead> {
  return request.patch<MentorRequestRead>(`/mentor-requests/${requestId}/status`, body);
}

export function cancelMentorRequest(requestId: string): Promise<MentorRequestRead> {
  return request.post<MentorRequestRead>(`/mentor-requests/${requestId}/cancel`);
}
