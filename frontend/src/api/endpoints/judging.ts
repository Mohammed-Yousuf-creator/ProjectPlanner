import { request } from '../client';
import type {
  EvaluationRead,
  EvaluationSaveRequest,
  JudgeCreate,
  JudgeRead,
  JudgingCriteriaCreate,
  JudgingCriteriaRead,
  JudgingCriteriaUpdate,
  LeaderboardEntryRead,
} from '../types';

export function addEventJudge(eventId: string, body: JudgeCreate): Promise<JudgeRead> {
  return request.post<JudgeRead>(`/events/${eventId}/judges`, body);
}

export function getEventJudges(eventId: string): Promise<JudgeRead[]> {
  return request.get<JudgeRead[]>(`/events/${eventId}/judges`);
}

export function removeEventJudge(eventId: string, userId: string): Promise<void> {
  return request.delete<void>(`/events/${eventId}/judges/${userId}`);
}

export function createJudgingCriterion(
  eventId: string,
  body: JudgingCriteriaCreate,
): Promise<JudgingCriteriaRead> {
  return request.post<JudgingCriteriaRead>(`/events/${eventId}/judging-criteria`, body);
}

export function getJudgingCriteria(eventId: string): Promise<JudgingCriteriaRead[]> {
  return request.get<JudgingCriteriaRead[]>(`/events/${eventId}/judging-criteria`);
}

export function updateJudgingCriterion(
  criterionId: string,
  body: JudgingCriteriaUpdate,
): Promise<JudgingCriteriaRead> {
  return request.patch<JudgingCriteriaRead>(`/judging-criteria/${criterionId}`, body);
}

export function deleteJudgingCriterion(criterionId: string): Promise<void> {
  return request.delete<void>(`/judging-criteria/${criterionId}`);
}

export function startEvaluation(submissionId: string): Promise<EvaluationRead> {
  return request.post<EvaluationRead>(`/submissions/${submissionId}/evaluations`);
}

/** GET /submissions/{id}/evaluations/me - 404 when the judge has not started yet. */
export function getMyEvaluation(submissionId: string): Promise<EvaluationRead> {
  return request.get<EvaluationRead>(`/submissions/${submissionId}/evaluations/me`);
}

export function saveEvaluation(
  evaluationId: string,
  body: EvaluationSaveRequest,
): Promise<EvaluationRead> {
  return request.put<EvaluationRead>(`/evaluations/${evaluationId}`, body);
}

export function submitEvaluation(evaluationId: string): Promise<EvaluationRead> {
  return request.post<EvaluationRead>(`/evaluations/${evaluationId}/submit`);
}

/** GET /events/{id}/leaderboard - 403 until the event is completed. */
export function getEventLeaderboard(eventId: string): Promise<LeaderboardEntryRead[]> {
  return request.get<LeaderboardEntryRead[]>(`/events/${eventId}/leaderboard`);
}
