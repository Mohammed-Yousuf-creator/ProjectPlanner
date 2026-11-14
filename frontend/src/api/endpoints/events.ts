import { cleanParams, request } from '../client';
import type { EventRead, EventUpdate } from '../types';

export type EventListParams = {
  event_type?: string;
  format?: string;
  city?: string;
  limit?: number;
  offset?: number;
};

/** GET /events - public discovery (published + public only, never drafts). */
export function getEvents(params: EventListParams = {}): Promise<EventRead[]> {
  return request.get<EventRead[]>('/events', { params: cleanParams(params) });
}

export function getEvent(eventId: string): Promise<EventRead> {
  return request.get<EventRead>(`/events/${eventId}`);
}

export function updateEvent(eventId: string, body: EventUpdate): Promise<EventRead> {
  return request.patch<EventRead>(`/events/${eventId}`, body);
}

export function publishEvent(eventId: string): Promise<EventRead> {
  return request.post<EventRead>(`/events/${eventId}/publish`);
}

export function cancelEvent(eventId: string): Promise<EventRead> {
  return request.post<EventRead>(`/events/${eventId}/cancel`);
}
