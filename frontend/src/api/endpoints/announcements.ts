import { request } from '../client';
import type { AnnouncementCreate, AnnouncementRead, AnnouncementUpdate } from '../types';

export function createAnnouncement(
  eventId: string,
  body: AnnouncementCreate,
): Promise<AnnouncementRead> {
  return request.post<AnnouncementRead>(`/events/${eventId}/announcements`, body);
}

export function getAnnouncements(eventId: string): Promise<AnnouncementRead[]> {
  return request.get<AnnouncementRead[]>(`/events/${eventId}/announcements`);
}

export function updateAnnouncement(
  announcementId: string,
  body: AnnouncementUpdate,
): Promise<AnnouncementRead> {
  return request.patch<AnnouncementRead>(`/announcements/${announcementId}`, body);
}

/** Publishing dispatches in-app notifications to the resolved audience. */
export function publishAnnouncement(announcementId: string): Promise<AnnouncementRead> {
  return request.post<AnnouncementRead>(`/announcements/${announcementId}/publish`);
}

export function withdrawAnnouncement(announcementId: string): Promise<AnnouncementRead> {
  return request.post<AnnouncementRead>(`/announcements/${announcementId}/withdraw`);
}
