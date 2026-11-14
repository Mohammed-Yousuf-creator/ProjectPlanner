import { cleanParams, request } from '../client';
import type { CheckInAttendeeRead, CheckInSummaryRead } from '../types';

export type CheckInListParams = {
  search?: string;
  checked_in?: boolean;
  page?: number;
  page_size?: number;
};

/** Note: this endpoint pages with 1-based `page` + `page_size`, not limit/offset. */
export function getCheckIns(
  eventId: string,
  params: CheckInListParams = {},
): Promise<CheckInAttendeeRead[]> {
  return request.get<CheckInAttendeeRead[]>(`/events/${eventId}/check-ins`, {
    params: cleanParams(params),
  });
}

export function getCheckInSummary(eventId: string): Promise<CheckInSummaryRead> {
  return request.get<CheckInSummaryRead>(`/events/${eventId}/check-ins/summary`);
}

export function checkInParticipant(
  eventId: string,
  userId: string,
): Promise<unknown> {
  return request.post<unknown>(`/events/${eventId}/participants/${userId}/check-in`);
}

export function undoCheckIn(eventId: string, userId: string): Promise<void> {
  return request.delete<void>(`/events/${eventId}/participants/${userId}/check-in`);
}
