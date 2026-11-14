import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { formatDateRange, humanizeEnum } from '@/lib/format';
import type { ParticipantEventItem } from '@/api/types';

/** Compact event row used by the dashboard's four collection panels. */
export function EventMiniCard({ item }: { item: ParticipantEventItem }) {
  return (
    <Link
      to={`/my/events/${item.event_id}`}
      className="group block rounded-xl border border-line-subtle bg-canvas p-3 transition-colors hover:border-rust/40 hover:bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="category">{humanizeEnum(item.event_type)}</Badge>
        <StatusBadge status={item.registration_status} />
      </div>
      <p className="mt-2 text-xs font-bold text-ink group-hover:text-rust">{item.event_name}</p>
      <p className="text-[11px] text-taupe">{item.organization_name}</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="font-mono">{formatDateRange(item.starts_at, item.ends_at)}</span>
        {item.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {item.city}
          </span>
        )}
      </div>
    </Link>
  );
}
