import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addEventJudge,
  createJudgingCriterion,
  deleteJudgingCriterion,
  getEventJudges,
  getJudgingCriteria,
  getMyEvaluation,
  removeEventJudge,
  saveEvaluation,
  startEvaluation,
  submitEvaluation,
  updateJudgingCriterion,
} from '@/api/endpoints/judging';
import type {
  EvaluationSaveRequest,
  JudgeCreate,
  JudgingCriteriaCreate,
  JudgingCriteriaUpdate,
} from '@/api/types';

export const judgingKeys = {
  judges: (eventId: string) => ['events', eventId, 'judges'] as const,
  criteria: (eventId: string) => ['events', eventId, 'judging-criteria'] as const,
  myEvaluation: (submissionId: string) => ['submissions', submissionId, 'evaluation', 'me'] as const,
};

export function useEventJudges(eventId: string | undefined) {
  return useQuery({
    queryKey: judgingKeys.judges(eventId ?? ''),
    queryFn: () => getEventJudges(eventId as string),
    enabled: Boolean(eventId),
    retry: 0,
  });
}

export function useAddJudge(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JudgeCreate) => addEventJudge(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.judges(eventId) });
    },
  });
}

export function useRemoveJudge(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeEventJudge(eventId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.judges(eventId) });
    },
  });
}

/** Visible to participants and judges (active criteria) and organisers (all). */
export function useJudgingCriteria(eventId: string | undefined) {
  return useQuery({
    queryKey: judgingKeys.criteria(eventId ?? ''),
    queryFn: () => getJudgingCriteria(eventId as string),
    enabled: Boolean(eventId),
    retry: 0,
  });
}

export function useCreateCriterion(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JudgingCriteriaCreate) => createJudgingCriterion(eventId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.criteria(eventId) });
    },
  });
}

export function useUpdateCriterion(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ criterionId, body }: { criterionId: string; body: JudgingCriteriaUpdate }) =>
      updateJudgingCriterion(criterionId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.criteria(eventId) });
    },
  });
}

export function useDeleteCriterion(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (criterionId: string) => deleteJudgingCriterion(criterionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.criteria(eventId) });
    },
  });
}

/** 404 means "not started yet" - callers render the Start evaluation CTA. */
export function useMyEvaluation(submissionId: string | undefined) {
  return useQuery({
    queryKey: judgingKeys.myEvaluation(submissionId ?? ''),
    queryFn: () => getMyEvaluation(submissionId as string),
    enabled: Boolean(submissionId),
    retry: 0,
  });
}

export function useStartEvaluation(submissionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startEvaluation(submissionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.myEvaluation(submissionId) });
    },
  });
}

export function useSaveEvaluation(submissionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ evaluationId, body }: { evaluationId: string; body: EvaluationSaveRequest }) =>
      saveEvaluation(evaluationId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.myEvaluation(submissionId) });
    },
  });
}

export function useSubmitEvaluation(submissionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (evaluationId: string) => submitEvaluation(evaluationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: judgingKeys.myEvaluation(submissionId) });
    },
  });
}
