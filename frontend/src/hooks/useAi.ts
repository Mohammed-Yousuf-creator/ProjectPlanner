import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createConversation,
  deleteConversation,
  getAiStatus,
  getConversation,
  getEventOverview,
  getMySkills,
  getSubmissionSummary,
  getTeamMatches,
  getTeammateMatches,
  listConversations,
  previewTeammateMatches,
  replaceMySkills,
  sendChatMessage,
  sendConversationMessage,
} from '@/api/endpoints/ai';
import type { SkillCreate } from '@/api/types';
import { useAuthStore } from '@/stores/authStore';

/* ------------------------------ capability ------------------------------ */

/**
 * Is AI live on this server?
 *
 * Every AI surface reads this so it can label fallback output honestly instead
 * of presenting scripted text as a model answer. Cached for 5 minutes: it only
 * changes when the server is redeployed with a different key.
 */
export function useAiStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: getAiStatus,
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

/* -------------------------------- skills -------------------------------- */

export function useMySkills(enabled = true) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  return useQuery({
    queryKey: ['ai', 'skills', 'me'],
    queryFn: getMySkills,
    enabled: enabled && isAuthenticated,
    staleTime: 60_000,
    retry: 0,
  });
}

export function useReplaceMySkills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skills: SkillCreate[]) => replaceMySkills(skills),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'skills'] });
      // Matches are derived from skills, so they are stale immediately.
      void queryClient.invalidateQueries({ queryKey: ['ai', 'matchmaking'] });
    },
  });
}

/* ------------------------------ matchmaking ----------------------------- */

export function useTeammateMatches(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['ai', 'matchmaking', 'teammates', eventId],
    queryFn: () => getTeammateMatches(eventId as string),
    enabled: Boolean(eventId) && enabled,
    staleTime: 60_000,
    retry: 0,
  });
}

export function useTeamMatches(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['ai', 'matchmaking', 'teams', eventId],
    queryFn: () => getTeamMatches(eventId as string),
    enabled: Boolean(eventId) && enabled,
    staleTime: 60_000,
    retry: 0,
  });
}

/** "What if I had these skills?" — nothing is saved. */
export function usePreviewMatches(eventId: string | undefined) {
  return useMutation({
    mutationFn: (skills: string[]) => previewTeammateMatches(eventId as string, skills),
  });
}

/* --------------------------------- chat --------------------------------- */

export function useConversations(enabled = true) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  return useQuery({
    queryKey: ['ai', 'conversations'],
    queryFn: listConversations,
    enabled: enabled && isAuthenticated,
    retry: 0,
  });
}

export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'conversation', conversationId],
    queryFn: () => getConversation(conversationId as string),
    enabled: Boolean(conversationId),
    retry: 0,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId?: string) => createConversation(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
  });
}

/**
 * Sending a message.
 *
 * The reply arrives in the same response as the send, so the mutation result is
 * the source of truth for the new turns. We invalidate the thread so a reload
 * reflects the persisted history, but we never clear local state on success —
 * that would blank the panel between the reply arriving and the refetch landing.
 */
export function useSendMessage(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ message, eventId }: { message: string; eventId?: string }) =>
      conversationId
        ? sendConversationMessage(conversationId, message, eventId)
        : sendChatMessage(message, eventId),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      void queryClient.invalidateQueries({
        queryKey: ['ai', 'conversation', response.conversation_id],
      });
    },
  });
}

/* ------------------------------- summaries ------------------------------ */

export function useSubmissionSummary(submissionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['ai', 'summary', submissionId],
    queryFn: () => getSubmissionSummary(submissionId as string),
    enabled: Boolean(submissionId) && enabled,
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

/** Regenerate a cached summary (explicit user action). */
export function useRegenerateSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submissionId: string) => getSubmissionSummary(submissionId, true),
    onSuccess: (summary) => {
      queryClient.setQueryData(['ai', 'summary', summary.submission_id], summary);
    },
  });
}

export function useEventOverview(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['ai', 'event-overview', eventId],
    queryFn: () => getEventOverview(eventId as string),
    enabled: Boolean(eventId) && enabled,
    staleTime: 10 * 60_000,
    retry: 0,
  });
}
