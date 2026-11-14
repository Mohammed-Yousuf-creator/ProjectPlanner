import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useSetTaskAssignees, useUpdateTeamTask } from '@/hooks/useTeamTasks';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants';
import { canEditTask } from '@/lib/permissions';
import { formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import type { TeamMemberInfo, TeamTaskRead, TeamTaskUpdateRequest } from '@/api/types';

/**
 * Task detail: status is editable by any active member; title/description,
 * priority, delete and assignees are limited to creator/owner/lead (server
 * enforces the same rules, so 403s are surfaced verbatim).
 */
export function TaskDetailModal({
  teamId,
  task,
  members,
  membership,
  onClose,
}: {
  teamId: string;
  task: TeamTaskRead;
  members: TeamMemberInfo[];
  membership: TeamMemberInfo | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const userId = useAuthStore((state) => state.user?.id);
  const canEditDetails = canEditTask(task.created_by_user_id, userId, membership);

  const updateTask = useUpdateTeamTask(teamId);
  const setAssignees = useSetTaskAssignees(teamId);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<string>(task.priority);
  const [status, setStatus] = useState<string>(task.status);
  const [dueAt, setDueAt] = useState(toDateTimeLocal(task.due_at));
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assignees.map((assignee) => assignee.user_id),
  );

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setStatus(task.status);
    setDueAt(toDateTimeLocal(task.due_at));
    setAssigneeIds(task.assignees.map((assignee) => assignee.user_id));
  }, [task]);

  const mutateOptions = {
    onSuccess: () => toast.success('Task updated.'),
    onError: (error: unknown) => toast.error(toApiError(error).message),
  };

  type TaskStatusValue = NonNullable<TeamTaskUpdateRequest['status']>;
  type TaskPriorityValue = NonNullable<TeamTaskUpdateRequest['priority']>;

  const moveTo = (nextStatus: string) => {
    setStatus(nextStatus);
    updateTask.mutate(
      { taskId: task.id, body: { status: nextStatus as TaskStatusValue } },
      mutateOptions,
    );
  };

  const toggleAssignee = (memberId: string) => {
    const next = assigneeIds.includes(memberId)
      ? assigneeIds.filter((id) => id !== memberId)
      : [...assigneeIds, memberId];
    setAssigneeIds(next);
    setAssignees.mutate({ taskId: task.id, body: { user_ids: next } }, mutateOptions);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Task details"
      description={`Created ${formatDateTime(task.created_at)}`}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canEditDetails && (
            <Button
              loading={updateTask.isPending}
              onClick={() =>
                updateTask.mutate(
                  {
                    taskId: task.id,
                    body: {
                      title: title.trim(),
                      description: description.trim() || null,
                      priority: priority as TaskPriorityValue,
                      due_at: fromDateTimeLocal(dueAt),
                    },
                  },
                  mutateOptions,
                )
              }
            >
              Save changes
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-subtle bg-canvas p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Move to
            </span>
            <div className="flex flex-wrap gap-1">
              {TASK_STATUSES.map((option) => (
                <Button
                  key={option.value}
                  variant={status === option.value ? 'primary' : 'chip'}
                  size="sm"
                  onClick={() => moveTo(option.value)}
                  disabled={updateTask.isPending}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {task.completed_at && (
            <Badge variant="metric">Completed {formatDateTime(task.completed_at)}</Badge>
          )}
        </div>

        <Field label="Title" htmlFor="detail-title" required>
          <Input
            id="detail-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!canEditDetails}
          />
        </Field>

        <Field label="Description" htmlFor="detail-description">
          <Textarea
            id="detail-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!canEditDetails}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority" htmlFor="detail-priority">
            <Select
              id="detail-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              disabled={!canEditDetails}
              options={TASK_PRIORITIES.map((option) => ({ value: option.value, label: option.label }))}
            />
          </Field>
          <Field label="Due date" htmlFor="detail-due">
            <Input
              id="detail-due"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              disabled={!canEditDetails}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">Assignees</p>
          {members.length === 0 ? (
            <p className="text-[11px] text-muted">No active members to assign.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {members.map((member) => {
                const checked = assigneeIds.includes(member.user_id);
                return (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => canEditDetails && toggleAssignee(member.user_id)}
                    disabled={!canEditDetails || setAssignees.isPending}
                    aria-pressed={checked}
                    className={
                      'flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors ' +
                      (checked
                        ? 'border-forest/40 bg-emerald-50'
                        : 'border-line bg-white hover:bg-canvas') +
                      (!canEditDetails ? ' cursor-not-allowed opacity-70' : '')
                    }
                  >
                    <Avatar name={member.display_name} username={member.username} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-ink">
                        {member.display_name}
                      </span>
                      <span className="block truncate text-[10px] text-muted">@{member.username}</span>
                    </span>
                    {checked && <Check className="h-3.5 w-3.5 text-forest" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
          {!canEditDetails && (
            <Alert tone="info">
              Only the task creator, the team owner, or a lead can change details and assignees.
            </Alert>
          )}
        </div>
      </div>
    </Modal>
  );
}
