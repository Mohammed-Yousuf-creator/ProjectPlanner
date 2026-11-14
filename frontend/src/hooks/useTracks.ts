import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEventTrack,
  deleteTrack,
  getEventTracks,
  updateTrack,
} from '@/api/endpoints/tracks';
import type { EventTrackCreate, EventTrackUpdate } from '@/api/types';

export const trackKeys = {
  list: (eventId: string) => ['events', eventId, 'tracks'] as const,
};

export function useEventTracks(eventId: string | undefined) {
  return useQuery({
    queryKey: trackKeys.list(eventId ?? ''),
    queryFn: () => getEventTracks(eventId as string),
    enabled: Boolean(eventId),
  });
}

export function useCreateTrack(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EventTrackCreate) => createEventTrack(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trackKeys.list(eventId) });
    },
  });
}

export function useUpdateTrack(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, body }: { trackId: string; body: EventTrackUpdate }) =>
      updateTrack(trackId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trackKeys.list(eventId) });
    },
  });
}

export function useDeleteTrack(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) => deleteTrack(trackId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trackKeys.list(eventId) });
    },
  });
}
