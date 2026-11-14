import { cleanParams, request } from '../client';
import type {
  EventScheduleItemCreate,
  EventScheduleItemRead,
  EventScheduleItemUpdate,
} from '../types';

export function createScheduleItem(
  eventId: string,
  body: EventScheduleItemCreate,
): Promise<EventScheduleItemRead> {
  return request.post<EventScheduleItemRead>(`/events/${eventId}/schedule`, body);
}

/** `include_cancelled` is organiser-only; the server rejects it for others. */
export function getSchedule(
  eventId: string,
  params: { include_cancelled?: boolean } = {},
): Promise<EventScheduleItemRead[]> {
  return request.get<EventScheduleItemRead[]>(`/events/${eventId}/schedule`, {
    params: cleanParams(params),
  });
}

export function updateScheduleItem(
  itemId: string,
  body: EventScheduleItemUpdate,
): Promise<EventScheduleItemRead> {
  return request.patch<EventScheduleItemRead>(`/schedule/${itemId}`, body);
}

/** DELETE marks the item as `cancelled` (soft cancel, not a hard delete). */
export function cancelScheduleItem(itemId: string): Promise<void> {
  return request.delete<void>(`/schedule/${itemId}`);
}
