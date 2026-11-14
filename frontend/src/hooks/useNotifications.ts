import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationListParams,
} from '@/api/endpoints/notifications';
import { useAuthStore } from '@/stores/authStore';

export const notificationKeys = {
  list: (params: NotificationListParams) => ['notifications', 'list', params] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

/** Pauses while the tab is hidden so a background tab makes no requests. */
function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );

  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return visible;
}

/**
 * Polls GET /notifications/me/unread-count every 30s. The backend has no
 * notification WebSocket, so polling is the supported mechanism.
 */
export function useUnreadNotificationCount() {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const visible = useDocumentVisible();

  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: getUnreadNotificationCount,
    enabled: isAuthenticated,
    refetchInterval: visible && isAuthenticated ? 30_000 : false,
    refetchOnWindowFocus: true,
    retry: 0,
  });
}

export function useNotifications(params: NotificationListParams = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => getNotifications(params),
    retry: 0,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
