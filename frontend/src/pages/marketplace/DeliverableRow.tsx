import { CalendarClock, ExternalLink } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { formatDate, isSafeHttpUrl } from '@/lib/format';
import type { SponsorshipDeliverableRead } from '@/api/types';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * One deliverable line with an inline status control.
 * `disabled` freezes the row when the parent deal is no longer active.
 */
export function DeliverableRow({
  deliverable,
  disabled = false,
  onStatusChange,
}: {
  deliverable: SponsorshipDeliverableRead;
  disabled?: boolean;
  onStatusChange: (status: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold text-ink">{deliverable.title}</p>
          <StatusBadge status={deliverable.status} />
          {deliverable.responsible_organization_name && (
            <Badge variant="neutral">{deliverable.responsible_organization_name}</Badge>
          )}
        </div>
        {deliverable.description && (
          <p className="mt-0.5 text-[11px] text-taupe">{deliverable.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted">
          {deliverable.due_at && (
            <span className="inline-flex items-center gap-1 font-mono uppercase tracking-wider">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              Due {formatDate(deliverable.due_at)}
            </span>
          )}
          {deliverable.completed_at && (
            <span className="font-mono uppercase tracking-wider text-forest">
              Completed {formatDate(deliverable.completed_at)}
            </span>
          )}
          {isSafeHttpUrl(deliverable.evidence_url) && (
            <a
              href={deliverable.evidence_url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-rust hover:underline"
            >
              Evidence
              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      <div className="w-40 shrink-0">
        <Select
          aria-label={`Status for ${deliverable.title}`}
          value={deliverable.status}
          onChange={(event) => onStatusChange(event.target.value)}
          disabled={disabled}
          options={STATUS_OPTIONS}
        />
      </div>
    </div>
  );
}
