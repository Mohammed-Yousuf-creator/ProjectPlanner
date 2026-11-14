import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelScheduleItem,
  createScheduleItem,
  getSchedule,
  updateScheduleItem,
} from '@/api/endpoints/schedule';
import type { EventScheduleItemCreate, EventScheduleItemUpdate } from '@/api/types';

export const scheduleKeys = {
  list: (eventId: string, includeCancelled: boolean) =>
    ['events', eventId, 'schedule', { includeCancelled }] as const,
};

/**
 * `include_cancelled` is organiser-only. Pass `true` only from the organiser
 * console; public/participant views always request active items.
 */
export function useSchedule(eventId: string | undefined, includeCancelled = false, enabled = true) {
  return useQuery({
    queryKey: scheduleKeys.list(eventId ?? '', includeCancelled),
    queryFn: () => getSchedule(eventId as string, { include_cancelled: includeCancelled }),
    enabled: Boolean(eventId) && enabled,
    retry: 0,
  });
}

export function useCreateScheduleItem(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EventScheduleItemCreate) => createScheduleItem(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'schedule'] });
    },
  });
}

export function useUpdateScheduleItem(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: EventScheduleItemUpdate }) =>
      updateScheduleItem(itemId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'schedule'] });
    },
  });
}

export function useCancelScheduleItem(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => cancelScheduleItem(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'schedule'] });
    },
  });
}
