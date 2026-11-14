import { useState } from 'react';
import { Gavel, Plus, Trash2, Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  useAddJudge,
  useCreateCriterion,
  useDeleteCriterion,
  useEventJudges,
  useJudgingCriteria,
  useRemoveJudge,
  useUpdateCriterion,
} from '@/hooks/useJudging';
import { toApiError } from '@/lib/errors';
import type { JudgeRead, JudgingCriteriaRead } from '@/api/types';

/**
 * Judges and scoring criteria.
 * The server refuses to change or delete a criterion once evaluations exist, so
 * that error is shown verbatim and the controls stay visible for clarity.
 */
export function ManageJudgingTab({ eventId }: { eventId: string }) {
  const toast = useToast();
  const judges = useEventJudges(eventId);
  const criteria = useJudgingCriteria(eventId);
  const addJudge = useAddJudge(eventId);
  const removeJudge = useRemoveJudge(eventId);
  const createCriterion = useCreateCriterion(eventId);
  const updateCriterion = useUpdateCriterion(eventId);
  const deleteCriterion = useDeleteCriterion(eventId);

  const [judgeEmail, setJudgeEmail] = useState('');
  const [judgeModalOpen, setJudgeModalOpen] = useState(false);
  const [removeJudgeTarget, setRemoveJudgeTarget] = useState<JudgeRead | null>(null);

  const [criterionModalOpen, setCriterionModalOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<JudgingCriteriaRead | null>(null);
  const [deleteCriterionTarget, setDeleteCriterionTarget] = useState<JudgingCriteriaRead | null>(null);
  const [criterionForm, setCriterionForm] = useState({
    name: '',
    description: '',
    max_score: '10',
    weight: '1',
  });

  const [criteriaLocked, setCriteriaLocked] = useState(false);

  const openCriterionCreate = () => {
    setEditingCriterion(null);
    setCriterionForm({ name: '', description: '', max_score: '10', weight: '1' });
    setCriterionModalOpen(true);
  };

  const openCriterionEdit = (criterion: JudgingCriteriaRead) => {
    setEditingCriterion(criterion);
    setCriterionForm({
      name: criterion.name,
      description: criterion.description ?? '',
      max_score: String(criterion.max_score),
      weight: String(criterion.weight),
    });
    setCriterionModalOpen(true);
  };

  const saveCriterion = () => {
    const maxScore = Number(criterionForm.max_score);
    const weight = Number(criterionForm.weight);
    if (!criterionForm.name.trim()) {
      toast.error('Criterion name is required.');
      return;
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      toast.error('Max score must be greater than zero.');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error('Weight must be greater than zero.');
      return;
    }

    const handleError = (error: unknown) => {
      const message = toApiError(error).message;
      if (message.toLowerCase().includes('evaluations have begun')) setCriteriaLocked(true);
      toast.error(message);
    };

    if (editingCriterion) {
      updateCriterion.mutate(
        {
          criterionId: editingCriterion.id,
          body: {
            name: criterionForm.name.trim(),
            description: criterionForm.description.trim() || null,
            max_score: maxScore,
            weight,
          },
        },
        {
          onSuccess: () => {
            toast.success('Criterion updated.');
            setCriterionModalOpen(false);
          },
          onError: handleError,
        },
      );
    } else {
      createCriterion.mutate(
        {
          name: criterionForm.name.trim(),
          description: criterionForm.description.trim() || null,
          max_score: maxScore,
          weight,
          sort_order: (criteria.data?.length ?? 0) + 1,
        },
        {
          onSuccess: () => {
            toast.success('Criterion created.');
            setCriterionModalOpen(false);
          },
          onError: handleError,
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardHeader
          title="Judges"
          description="Judges must already have an account. A user cannot be both participant and judge."
          actions={
            <Button
              size="sm"
              onClick={() => setJudgeModalOpen(true)}
              icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Add judge
            </Button>
          }
        />
        {judges.isLoading ? (
          <SkeletonLines lines={3} />
        ) : judges.isError ? (
          <ErrorState error={judges.error} onRetry={() => void judges.refetch()} />
        ) : !judges.data || judges.data.length === 0 ? (
          <EmptyState
            inline
            icon={Gavel}
            title="No judges yet"
            description="Add judges before the event starts so they can evaluate submissions."
          />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {judges.data.map((judge) => (
              <li key={judge.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={judge.display_name} username={judge.username} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink">
                      {judge.display_name ?? judge.full_name ?? judge.username}
                    </p>
                    <p className="truncate text-[11px] text-taupe">
                      @{judge.username} · {judge.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="metric">{judge.status}</Badge>
                  <Button
                    variant="chip"
                    size="sm"
                    icon={<Trash2 className="h-3 w-3" aria-hidden="true" />}
                    onClick={() => setRemoveJudgeTarget(judge)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <CardHeader
          title="Judging criteria"
          description="Scores are normalized per criterion, weighted, then averaged across judges."
          actions={
            <Button
              size="sm"
              onClick={openCriterionCreate}
              icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Add criterion
            </Button>
          }
        />

        {criteriaLocked && (
          <Alert tone="warning" title="Criteria are locked">
            Evaluations have already begun for this event, so criteria can no longer be added,
            edited or deleted.
          </Alert>
        )}

        {criteria.isLoading ? (
          <SkeletonLines lines={3} />
        ) : criteria.isError ? (
          <ErrorState error={criteria.error} onRetry={() => void criteria.refetch()} />
        ) : !criteria.data || criteria.data.length === 0 ? (
          <EmptyState
            inline
            icon={Users}
            title="No criteria configured"
            description="Add at least one criterion before judges start evaluating."
          />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {criteria.data.map((criterion) => (
              <li key={criterion.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink">{criterion.name}</p>
                  {criterion.description && (
                    <p className="text-[11px] text-taupe">{criterion.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">max {criterion.max_score}</Badge>
                  <Badge variant="metric">weight {criterion.weight}</Badge>
                  {!criterion.is_active && <Badge variant="danger">inactive</Badge>}
                  <Button variant="chip" size="sm" onClick={() => openCriterionEdit(criterion)}>
                    Edit
                  </Button>
                  <Button
                    variant="chip"
                    size="sm"
                    onClick={() => setDeleteCriterionTarget(criterion)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={judgeModalOpen}
        onClose={() => {
          setJudgeModalOpen(false);
          addJudge.reset();
        }}
        title="Add a judge"
        description="Look them up by the email on their account."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setJudgeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={addJudge.isPending}
              onClick={() => {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(judgeEmail)) {
                  toast.error('Enter a valid email address.');
                  return;
                }
                addJudge.mutate(
                  { email: judgeEmail.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Judge added.');
                      setJudgeEmail('');
                      setJudgeModalOpen(false);
                    },
                    onError: (error) => toast.error(toApiError(error).message),
                  },
                );
              }}
            >
              Add judge
            </Button>
          </>
        }
      >
        {addJudge.isError && (
          <Alert tone="error" title="Could not add the judge">
            {toApiError(addJudge.error).message}
          </Alert>
        )}
        <Field label="Judge email" htmlFor="judge-email" required>
          <Input
            id="judge-email"
            type="email"
            value={judgeEmail}
            onChange={(event) => setJudgeEmail(event.target.value)}
            placeholder="judge@example.com"
          />
        </Field>
      </Modal>

      <Modal
        open={criterionModalOpen}
        onClose={() => setCriterionModalOpen(false)}
        title={editingCriterion ? 'Edit criterion' : 'New criterion'}
        description="Max score must be > 0 and weight must be > 0."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCriterionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveCriterion}
              loading={createCriterion.isPending || updateCriterion.isPending}
            >
              {editingCriterion ? 'Save changes' : 'Create criterion'}
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="criterion-name" required>
          <Input
            id="criterion-name"
            value={criterionForm.name}
            onChange={(event) => setCriterionForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Technical execution"
          />
        </Field>
        <Field label="Description" htmlFor="criterion-description">
          <Textarea
            id="criterion-description"
            rows={3}
            value={criterionForm.description}
            onChange={(event) =>
              setCriterionForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Max score" htmlFor="criterion-max" required>
            <Input
              id="criterion-max"
              type="number"
              min={0.1}
              step={0.1}
              value={criterionForm.max_score}
              onChange={(event) =>
                setCriterionForm((prev) => ({ ...prev, max_score: event.target.value }))
              }
            />
          </Field>
          <Field label="Weight" htmlFor="criterion-weight" required>
            <Input
              id="criterion-weight"
              type="number"
              min={0.1}
              step={0.1}
              value={criterionForm.weight}
              onChange={(event) =>
                setCriterionForm((prev) => ({ ...prev, weight: event.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeJudgeTarget)}
        onClose={() => setRemoveJudgeTarget(null)}
        onConfirm={() => {
          if (!removeJudgeTarget) return;
          removeJudge.mutate(removeJudgeTarget.user_id, {
            onSuccess: () => {
              toast.success('Judge removed. Existing evaluations are preserved.');
              setRemoveJudgeTarget(null);
            },
            onError: (error) => {
              setRemoveJudgeTarget(null);
              toast.error(toApiError(error).message);
            },
          });
        }}
        title="Remove this judge?"
        confirmLabel="Remove judge"
        destructive
        loading={removeJudge.isPending}
      >
        <p>
          {removeJudgeTarget?.display_name ?? removeJudgeTarget?.username} loses judging access.
          Evaluations they already submitted are kept.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteCriterionTarget)}
        onClose={() => setDeleteCriterionTarget(null)}
        onConfirm={() => {
          if (!deleteCriterionTarget) return;
          deleteCriterion.mutate(deleteCriterionTarget.id, {
            onSuccess: () => {
              toast.success('Criterion deleted.');
              setDeleteCriterionTarget(null);
            },
            onError: (error) => {
              const message = toApiError(error).message;
              if (message.toLowerCase().includes('evaluations have begun')) setCriteriaLocked(true);
              setDeleteCriterionTarget(null);
              toast.error(message);
            },
          });
        }}
        title="Delete this criterion?"
        confirmLabel="Delete criterion"
        destructive
        loading={deleteCriterion.isPending}
      >
        <p>
          Deleting “{deleteCriterionTarget?.name}” changes how every future evaluation is scored. The
          server blocks this once evaluations have begun.
        </p>
      </ConfirmDialog>
    </div>
  );
}
