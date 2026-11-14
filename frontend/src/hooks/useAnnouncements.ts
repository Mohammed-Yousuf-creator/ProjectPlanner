import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAnnouncement,
  getAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  withdrawAnnouncement,
} from '@/api/endpoints/announcements';
import type { AnnouncementCreate, AnnouncementUpdate } from '@/api/types';

export const announcementKeys = {
  list: (eventId: string) => ['events', eventId, 'announcements'] as const,
};

export function useAnnouncements(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.list(eventId ?? ''),
    queryFn: () => getAnnouncements(eventId as string),
    enabled: Boolean(eventId) && enabled,
    retry: 0,
  });
}

export function useCreateAnnouncement(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AnnouncementCreate) => createAnnouncement(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.list(eventId) });
    },
  });
}

export function useUpdateAnnouncement(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AnnouncementUpdate }) =>
      updateAnnouncement(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.list(eventId) });
    },
  });
}

export function useAnnouncementAction(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'publish' | 'withdraw' }) =>
      action === 'publish' ? publishAnnouncement(id) : withdrawAnnouncement(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.list(eventId) });
    },
  });
}
