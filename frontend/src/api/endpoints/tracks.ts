import { request } from '../client';
import type { EventTrackCreate, EventTrackRead, EventTrackUpdate } from '../types';

export function createEventTrack(
  eventId: string,
  body: EventTrackCreate,
): Promise<EventTrackRead> {
  return request.post<EventTrackRead>(`/events/${eventId}/tracks`, body);
}

export function getEventTracks(eventId: string): Promise<EventTrackRead[]> {
  return request.get<EventTrackRead[]>(`/events/${eventId}/tracks`);
}

export function updateTrack(trackId: string, body: EventTrackUpdate): Promise<EventTrackRead> {
  return request.patch<EventTrackRead>(`/tracks/${trackId}`, body);
}

export function deleteTrack(trackId: string): Promise<void> {
  return request.delete<void>(`/tracks/${trackId}`);
}
