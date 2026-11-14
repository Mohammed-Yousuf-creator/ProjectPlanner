import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getEventParticipants,
  registerForEvent,
  updateParticipantStatus,
  withdrawFromEvent,
  type EventParticipantParams,
} from '@/api/endpoints/registrations';
import type { EventRegisterRequest, ParticipantStatusUpdateRequest } from '@/api/types';
import { eventKeys } from './useEvents';

export const registrationKeys = {
  participants: (eventId: string, params: EventParticipantParams) =>
    ['events', eventId, 'participants', params] as const,
};

/** POST /events/{id}/register - also used to reactivate a withdrawn record. */
export function useRegisterForEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: EventRegisterRequest) => registerForEvent(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      void queryClient.invalidateQueries({ queryKey: ['participants', 'me'] });
    },
  });
}

export function useWithdrawFromEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => withdrawFromEvent(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      void queryClient.invalidateQueries({ queryKey: ['participants', 'me'] });
    },
  });
}

export function useEventParticipants(eventId: string | undefined, params: EventParticipantParams) {
  return useQuery({
    queryKey: registrationKeys.participants(eventId ?? '', params),
    queryFn: () => getEventParticipants(eventId as string, params),
    enabled: Boolean(eventId),
  });
}

export function useUpdateParticipantStatus(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: ParticipantStatusUpdateRequest }) =>
      updateParticipantStatus(eventId, userId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'participants'] });
    },
  });
}
