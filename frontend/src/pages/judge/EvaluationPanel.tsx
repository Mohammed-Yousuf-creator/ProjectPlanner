import { useEffect, useMemo, useState } from 'react';
import { Lock, Play, Send } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import {
  useMyEvaluation,
  useSaveEvaluation,
  useStartEvaluation,
  useSubmitEvaluation,
} from '@/hooks/useJudging';
import { formatDateTime, formatScore } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { EvaluationScoreItem, JudgingCriteriaRead } from '@/api/types';

/**
 * Draft/submitted evaluation editor.
 * A submitted evaluation is immutable (409 on edit), so every control is
 * disabled and the panel becomes a read-only scorecard.
 */
export function EvaluationPanel({
  submissionId,
  criteria,
}: {
  submissionId: string;
  criteria: JudgingCriteriaRead[];
}) {
  const toast = useToast();
  const evaluationQuery = useMyEvaluation(submissionId);
  const start = useStartEvaluation(submissionId);
  const save = useSaveEvaluation(submissionId);
  const submit = useSubmitEvaluation(submissionId);

  const evaluation = evaluationQuery.data;
  const notFound = evaluationQuery.isError && toApiError(evaluationQuery.error).status === 404;
  const submitted = evaluation?.status === 'submitted';
  const locked = submitted;

  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!evaluation) {
      setScores({});
      setFeedback('');
      return;
    }
    const nextScores: Record<string, string> = {};
    for (const score of evaluation.scores) {
      nextScores[score.criteria_id] = String(score.score);
    }
    setScores(nextScores);
    setFeedback(evaluation.overall_feedback ?? '');
  }, [evaluation]);

  const activeCriteria = useMemo(
    () => criteria.filter((criterion) => criterion.is_active),
    [criteria],
  );

  const [confirmSubmit, setConfirmSubmit] = useState(false);

  if (evaluationQuery.isLoading) {
    return (
      <Card>
        <SkeletonLines lines={5} />
      </Card>
    );
  }

  if (evaluationQuery.isError && !notFound) {
    const apiError = toApiError(evaluationQuery.error);
    return (
      <Card className="space-y-3">
        <CardHeader title="Your evaluation" />
        <Alert tone="error" title="Could not load your evaluation">
          {apiError.message}
        </Alert>
      </Card>
    );
  }

  if (notFound || !evaluation) {
    return (
      <Card className="space-y-3">
        <CardHeader
          title="Your evaluation"
          description="No evaluation exists for this submission yet."
        />
        <EmptyState
          inline
          icon={Play}
          title="Start an evaluation"
          description="Creating the draft is required before any scores can be recorded."
          actions={
            <Button
              loading={start.isPending}
              onClick={() =>
                start.mutate(undefined, {
                  onSuccess: () => toast.success('Draft evaluation created.'),
                  onError: (error) => toast.error(toApiError(error).message),
                })
              }
            >
              Start evaluation
            </Button>
          }
        />
        {start.isError && (
          <Alert tone="error" title="Could not start the evaluation">
            {toApiError(start.error).message}
          </Alert>
        )}
      </Card>
    );
  }

  const buildScores = (): EvaluationScoreItem[] => {
    const items: EvaluationScoreItem[] = [];
    for (const criterion of activeCriteria) {
      const raw = scores[criterion.id];
      if (raw === undefined || raw.trim() === '') continue;
      items.push({ criteria_id: criterion.id, score: Number(raw), feedback: null });
    }
    return items;
  };

  const saveDrafts = () => {
    save.mutate(
      { evaluationId: evaluation.id, body: { overall_feedback: feedback.trim() || null, scores: buildScores() } },
      {
        onSuccess: () => toast.success('Draft saved.'),
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  const scoreError = (criterionId: string, max: number): string | null => {
    const raw = scores[criterionId];
    if (raw === undefined || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 'Enter a number.';
    if (value < 0) return 'Scores cannot be negative.';
    if (value > max) return `Maximum is ${max}.`;
    return null;
  };

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Your evaluation"
        description="Drafts can be incomplete. Submitting requires every active criterion."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={evaluation.status} />
            {locked && (
              <Badge variant="neutral">
                <Lock className="h-3 w-3" aria-hidden="true" /> Locked
              </Badge>
            )}
          </div>
        }
      />

      {submitted && evaluation.submitted_at && (
        <Alert tone="success" title="Evaluation submitted">
          Submitted {formatDateTime(evaluation.submitted_at)}. Submitted evaluations cannot be
          edited.
        </Alert>
      )}

      {activeCriteria.length === 0 ? (
        <Alert tone="info" title="No active criteria">
          The organizers have not published active judging criteria yet, so no scores can be
          recorded.
        </Alert>
      ) : (
        <div className="space-y-3 pt-1">
          {activeCriteria.map((criterion) => {
            const error = scoreError(criterion.id, criterion.max_score);
            return (
              <div
                key={criterion.id}
                className="rounded-xl border border-line-subtle bg-canvas p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink">{criterion.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="metric">weight {criterion.weight}</Badge>
                    <Badge variant="neutral">0–{criterion.max_score}</Badge>
                  </div>
                </div>
                {criterion.description && (
                  <p className="mt-1 text-[11px] text-taupe">{criterion.description}</p>
                )}
                <div className="mt-2 max-w-[10rem]">
                  <Field
                    label="Score"
                    htmlFor={`score-${criterion.id}`}
                    error={error}
                    required
                  >
                    <Input
                      id={`score-${criterion.id}`}
                      type="number"
                      min={0}
                      max={criterion.max_score}
                      step="0.1"
                      value={scores[criterion.id] ?? ''}
                      onChange={(event) =>
                        setScores((prev) => ({ ...prev, [criterion.id]: event.target.value }))
                      }
                      disabled={locked}
                      invalid={Boolean(error)}
                    />
                  </Field>
                </div>
              </div>
            );
          })}

          <Field label="Overall feedback" htmlFor="evaluation-feedback">
            <Textarea
              id="evaluation-feedback"
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              disabled={locked}
              placeholder="Notes for the organizers. Visible to organizers and admins."
            />
          </Field>
        </div>
      )}

      {!locked && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
          <Button
            variant="outline"
            onClick={saveDrafts}
            loading={save.isPending}
            disabled={activeCriteria.length === 0}
          >
            Save draft
          </Button>
          <Button
            onClick={() => setConfirmSubmit(true)}
            loading={submit.isPending}
            disabled={activeCriteria.length === 0}
            icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Submit evaluation
          </Button>
        </div>
      )}

      {(save.isError || submit.isError) && (
        <Alert tone="error" title="Could not save the evaluation">
          {toApiError(save.error ?? submit.error).message}
        </Alert>
      )}

      {locked && (
        <div className="space-y-1 border-t border-line-subtle pt-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Recorded scores</p>
          <ul className="space-y-1">
            {evaluation.scores.map((score) => (
              <li key={score.id} className="flex items-center justify-between text-[11px]">
                <span className="text-taupe">
                  {score.criterion_name ?? score.criteria_id}
                </span>
                <span className="font-mono font-bold text-forest">
                  {formatScore(score.score, 2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() =>
          submit.mutate(evaluation.id, {
            onSuccess: () => {
              toast.success('Evaluation submitted.');
              setConfirmSubmit(false);
            },
            onError: (error) => {
              setConfirmSubmit(false);
              toast.error(toApiError(error).message);
            },
          })
        }
        title="Submit this evaluation?"
        description="Submitted evaluations cannot be edited."
        confirmLabel="Submit evaluation"
        loading={submit.isPending}
      >
        <p>
          Every active criterion must have a score within its range, or the server rejects the
          submission with a message naming the failing criterion.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
