import { useMemo, useState } from 'react';
import { KanbanSquare, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useDeleteTeamTask, useTeamTasks, useUpdateTeamTask } from '@/hooks/useTeamTasks';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants';
import { canEditTask } from '@/lib/permissions';
import { toApiError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import type { TeamDetailRead, TeamMemberInfo, TeamTaskRead } from '@/api/types';
import { BoardTaskCard } from './BoardTaskCard';
import { TaskDetailModal } from './TaskDetailModal';
import { CreateTaskModal } from './CreateTaskModal';

type StatusValue = (typeof TASK_STATUSES)[number]['value'];

/** Four fixed columns: todo, in_progress, review, done. */
export function TeamBoardTab({
  team,
  membership,
}: {
  team: TeamDetailRead;
  membership: TeamMemberInfo | null;
}) {
  const toast = useToast();
  const userId = useAuthStore((state) => state.user?.id);
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<StatusValue>('todo');
  const [openTask, setOpenTask] = useState<TeamTaskRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamTaskRead | null>(null);

  const tasksQuery = useTeamTasks(team.id, {
    priority: priority || undefined,
    assignee_id: assignee || undefined,
  });
  const updateTask = useUpdateTeamTask(team.id);
  const deleteTask = useDeleteTeamTask(team.id);

  const activeMembers = (team.members ?? []).filter((member) => member.status === 'active');

  const filtered = useMemo(() => {
    const list = tasksQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (task) =>
        task.title.toLowerCase().includes(term) ||
        (task.description ?? '').toLowerCase().includes(term),
    );
  }, [tasksQuery.data, search]);

  const columns = TASK_STATUSES.map((status) => ({
    ...status,
    items: filtered
      .filter((task) => task.status === status.value)
      .sort((a, b) => a.position - b.position),
  }));

  const moveTask = (task: TeamTaskRead, status: StatusValue) => {
    if (task.status === status) return;
    updateTask.mutate(
      { taskId: task.id, body: { status } },
      {
        onSuccess: () => toast.success(`Moved to ${status.replace(/_/g, ' ')}.`),
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 gap-2 sm:grid-cols-3">
            <Input
              placeholder="Search tasks…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search tasks"
            />
            <Select
              aria-label="Filter by priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              placeholder="Any priority"
              options={TASK_PRIORITIES.map((option) => ({ value: option.value, label: option.label }))}
            />
            <Select
              aria-label="Filter by assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              placeholder="Any assignee"
              options={activeMembers.map((member) => ({
                value: member.user_id,
                label: member.display_name,
              }))}
            />
          </div>
          <Button
            onClick={() => {
              setCreateStatus('todo');
              setCreateOpen(true);
            }}
            icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            New task
          </Button>
        </div>
        <p className="text-[11px] text-muted">
          Drag a card between columns to change its status, or open a task and use “Move to”.
        </p>
      </Card>

      {tasksQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : tasksQuery.isError ? (
        <ErrorState error={tasksQuery.error} onRetry={() => void tasksQuery.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title={search || priority || assignee ? 'No tasks match these filters' : 'No tasks yet'}
          description={
            search || priority || assignee
              ? 'Adjust or clear the filters to see the rest of the board.'
              : 'Create the first task to start tracking the team’s work.'
          }
          actions={
            !search && !priority && !assignee ? (
              <Button onClick={() => setCreateOpen(true)}>Create a task</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((column) => (
            <section
              key={column.value}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas-2 p-2.5"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const taskId = event.dataTransfer.getData('text/task-id');
                const task = (tasksQuery.data ?? []).find((item) => item.id === taskId);
                if (task) moveTask(task, column.value as StatusValue);
              }}
            >
              <header className="flex items-center justify-between px-1">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-taupe">
                  {column.label}
                </h3>
                <span className="font-mono text-[10px] font-bold text-forest">{column.items.length}</span>
              </header>

              <div className="flex flex-col gap-2">
                {column.items.length === 0 && (
                  <p className="px-1 py-4 text-center text-[11px] text-muted">No tasks</p>
                )}
                {column.items.map((task) => (
                  <BoardTaskCard
                    key={task.id}
                    task={task}
                    canEdit={canEditTask(task.created_by_user_id, userId, membership)}
                    onOpen={() => setOpenTask(task)}
                    onDelete={() => setDeleteTarget(task)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/task-id', task.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  />
                ))}
              </div>

              <Button
                variant="chip"
                size="sm"
                block
                onClick={() => {
                  setCreateStatus(column.value as StatusValue);
                  setCreateOpen(true);
                }}
                icon={<Plus className="h-3 w-3" aria-hidden="true" />}
              >
                Add task
              </Button>
            </section>
          ))}
        </div>
      )}

      <CreateTaskModal
        teamId={team.id}
        open={createOpen}
        defaultStatus={createStatus}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          toast.success('Task created.');
        }}
      />

      {openTask && (
        <TaskDetailModal
          teamId={team.id}
          task={openTask}
          members={activeMembers}
          membership={membership}
          onClose={() => setOpenTask(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteTask.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success('Task deleted.');
              setDeleteTarget(null);
            },
            onError: (error) => {
              setDeleteTarget(null);
              toast.error(toApiError(error).message);
            },
          });
        }}
        title="Delete this task?"
        description="The task is soft-deleted and disappears from the board for everyone."
        confirmLabel="Delete task"
        destructive
        loading={deleteTask.isPending}
      >
        <p>“{deleteTarget?.title}” will be removed. Assigned members lose it from their board.</p>
      </ConfirmDialog>
    </div>
  );
}
