import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkInParticipant,
  getCheckInSummary,
  getCheckIns,
  undoCheckIn,
  type CheckInListParams,
} from '@/api/endpoints/checkins';

export const checkInKeys = {
  list: (eventId: string, params: CheckInListParams) =>
    ['events', eventId, 'check-ins', params] as const,
  summary: (eventId: string) => ['events', eventId, 'check-ins', 'summary'] as const,
};

export function useCheckIns(eventId: string | undefined, params: CheckInListParams = {}) {
  return useQuery({
    queryKey: checkInKeys.list(eventId ?? '', params),
    queryFn: () => getCheckIns(eventId as string, params),
    enabled: Boolean(eventId),
    retry: 0,
  });
}

export function useCheckInSummary(eventId: string | undefined) {
  return useQuery({
    queryKey: checkInKeys.summary(eventId ?? ''),
    queryFn: () => getCheckInSummary(eventId as string),
    enabled: Boolean(eventId),
    retry: 0,
  });
}

export function useCheckInActions(eventId: string) {
  const queryClient = useQueryClient();

  const checkIn = useMutation({
    mutationFn: (userId: string) => checkInParticipant(eventId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'check-ins'] });
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'participants'] });
    },
  });

  const undo = useMutation({
    mutationFn: (userId: string) => undoCheckIn(eventId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'check-ins'] });
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'participants'] });
    },
  });

  return { checkIn, undo };
}
