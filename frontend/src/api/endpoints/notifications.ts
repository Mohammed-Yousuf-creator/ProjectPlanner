import { cleanParams, request } from '../client';
import type { NotificationRead, NotificationUnreadCountResponse } from '../types';

export type NotificationListParams = {
  unread_only?: boolean;
  page?: number;
  page_size?: number;
};

export function getNotifications(
  params: NotificationListParams = {},
): Promise<NotificationRead[]> {
  return request.get<NotificationRead[]>('/notifications/me', { params: cleanParams(params) });
}

export function getUnreadNotificationCount(): Promise<NotificationUnreadCountResponse> {
  return request.get<NotificationUnreadCountResponse>('/notifications/me/unread-count');
}

export function markNotificationRead(notificationId: string): Promise<NotificationRead> {
  return request.patch<NotificationRead>(`/notifications/${notificationId}/read`);
}

export function markAllNotificationsRead(): Promise<{ message?: string }> {
  return request.post<{ message?: string }>('/notifications/me/read-all');
}
