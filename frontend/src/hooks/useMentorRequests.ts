import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignMentorRequest,
  cancelMentorRequest,
  createMentorRequest,
  getEventMentorRequests,
  updateMentorRequestStatus,
} from '@/api/endpoints/mentorRequests';
import type {
  MentorRequestAssign,
  MentorRequestCreate,
  MentorRequestStatusUpdate,
} from '@/api/types';

export const mentorKeys = {
  event: (eventId: string, params: Record<string, unknown>) =>
    ['events', eventId, 'mentor-requests', params] as const,
  mine: (eventId?: string) => ['participants', 'me', 'mentor-requests', eventId ?? 'all'] as const,
};

export function useEventMentorRequests(
  eventId: string | undefined,
  params: { status?: string; priority?: string; page?: number; page_size?: number } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: mentorKeys.event(eventId ?? '', params),
    queryFn: () => getEventMentorRequests(eventId as string, params),
    enabled: Boolean(eventId) && enabled,
    retry: 0,
  });
}

export function useCreateMentorRequest(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MentorRequestCreate) => createMentorRequest(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mentorKeys.mine(eventId) });
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'mentor-requests'] });
    },
  });
}

export function useCancelMentorRequest(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelMentorRequest(requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mentorKeys.mine(eventId) });
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'mentor-requests'] });
    },
  });
}

export function useAssignMentorRequest(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: string; body: MentorRequestAssign }) =>
      assignMentorRequest(requestId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'mentor-requests'] });
    },
  });
}

export function useUpdateMentorRequestStatus(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, body }: { requestId: string; body: MentorRequestStatusUpdate }) =>
      updateMentorRequestStatus(requestId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'mentor-requests'] });
      void queryClient.invalidateQueries({ queryKey: mentorKeys.mine(eventId) });
    },
  });
}
