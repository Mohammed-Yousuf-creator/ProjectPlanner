import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelEvent,
  getEvent,
  getEvents,
  publishEvent,
  updateEvent,
  type EventListParams,
} from '@/api/endpoints/events';
import type { EventUpdate } from '@/api/types';

export const eventKeys = {
  all: ['events'] as const,
  list: (params: EventListParams) => ['events', 'list', params] as const,
  detail: (eventId: string) => ['events', 'detail', eventId] as const,
};

export function useEvents(params: EventListParams = {}) {
  return useQuery({
    queryKey: eventKeys.list(params),
    queryFn: () => getEvents(params),
    staleTime: 30_000,
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: eventKeys.detail(eventId ?? ''),
    queryFn: () => getEvent(eventId as string),
    enabled: Boolean(eventId),
  });
}

export function usePublishEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => publishEvent(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useCancelEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelEvent(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EventUpdate) => updateEvent(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}
