import { ExternalLink, MapPin, Video } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { formatDateTime, humanizeEnum, isSafeHttpUrl } from '@/lib/format';
import type { EventScheduleItemRead } from '@/api/types';

/** One agenda row; shared by the public schedule page and the organizer tab. */
export function ScheduleItemRow({
  item,
  actions,
}: {
  item: EventScheduleItemRead;
  actions?: React.ReactNode;
}) {
  const cancelled = item.status === 'cancelled';

  return (
    <div
      className={
        'rounded-xl border border-line-subtle bg-white p-3.5 ' + (cancelled ? 'opacity-60' : '')
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{humanizeEnum(item.item_type)}</Badge>
            {cancelled && <StatusBadge status="cancelled" />}
          </div>
          <p className="text-xs font-bold text-ink">{item.title}</p>
          {item.description && (
            <p className="text-[11px] leading-relaxed text-taupe">{item.description}</p>
          )}
        </div>
        <p className="font-mono text-[11px] text-taupe">
          {formatDateTime(item.starts_at)} → {formatDateTime(item.ends_at)}
        </p>
      </div>

      {(item.venue || isSafeHttpUrl(item.meeting_url)) && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-taupe">
          {item.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-muted" aria-hidden="true" />
              {item.venue}
            </span>
          )}
          {isSafeHttpUrl(item.meeting_url) && (
            <a
              href={item.meeting_url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-rust hover:underline"
            >
              <Video className="h-3 w-3" aria-hidden="true" />
              Join online
              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
