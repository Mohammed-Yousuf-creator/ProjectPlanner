import { CalendarClock, MessageSquare, Trash2, UserCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { TeamTaskRead } from '@/api/types';

const PRIORITY_VARIANT: Record<string, 'neutral' | 'metric' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'metric',
  high: 'warning',
  urgent: 'danger',
};

/** One task tile. Editing controls are gated by the caller's permissions. */
export function BoardTaskCard({
  task,
  canEdit,
  onOpen,
  onDelete,
  onDragStart,
}: {
  task: TeamTaskRead;
  canEdit: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'space-y-2 rounded-xl border border-line bg-white p-3 shadow-sm transition-shadow hover:shadow-md',
        'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left text-xs font-bold text-ink transition-colors hover:text-rust focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
        >
          {task.title}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete task ${task.title}`}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-red-50 hover:text-red-800"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {task.description && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-taupe">{task.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'neutral'}>{task.priority}</Badge>
        {task.due_at && (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted">
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {formatDate(task.due_at)}
          </span>
        )}
        {task.completed_at && (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-forest">
            Done {formatDate(task.completed_at)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line-subtle pt-2">
        <div className="flex items-center gap-1">
          {task.assignees.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted">
              <UserCircle2 className="h-3 w-3" aria-hidden="true" />
              Unassigned
            </span>
          ) : (
            <div className="flex items-center -space-x-1.5">
              {task.assignees.slice(0, 3).map((assignee) => (
                <Avatar
                  key={assignee.user_id}
                  name={assignee.display_name}
                  username={assignee.username}
                  src={assignee.avatar_url}
                  size="xs"
                  className="border border-white"
                />
              ))}
              {task.assignees.length > 3 && (
                <span className="ml-2 font-mono text-[10px] text-muted">
                  +{task.assignees.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          variant="chip"
          size="sm"
          onClick={onOpen}
          icon={<MessageSquare className="h-3 w-3" aria-hidden="true" />}
        >
          Details
        </Button>
      </div>
    </div>
  );
}
