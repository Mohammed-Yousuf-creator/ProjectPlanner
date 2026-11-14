import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { formatDateRange } from '@/lib/format';
import { humanizeEnum } from '@/lib/format';
import type { EventRead } from '@/api/types';

/** DESIGN_SYSTEM 5.4 event card - every field rendered exists on `EventRead`. */
export function EventCard({ event }: { event: EventRead }) {
  const location = [event.venue_name, event.city, event.country].filter(Boolean).join(', ');

  return (
    <Link
      to={`/events/${event.id}`}
      className="group flex flex-col justify-between space-y-4 rounded-2xl border border-line bg-white p-6 transition-all hover:border-rust/60 hover:shadow-md focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="category">{humanizeEnum(event.event_type)}</Badge>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={event.format} variant="neutral" />
            {event.status !== 'published' && <StatusBadge status={event.status} />}
          </div>
        </div>

        <div>
          <h3 className="line-clamp-2 text-base font-bold text-ink transition-colors group-hover:text-rust">
            {event.name}
          </h3>
          {event.short_description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-taupe">
              {event.short_description}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-line-subtle pt-4">
        <p className="flex items-center gap-1.5 text-xs text-taupe">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="font-mono text-[11px]">{formatDateRange(event.starts_at, event.ends_at)}</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-taupe">
          <span className="flex items-center gap-1.5">
            {location ? (
              <>
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                {location}
              </>
            ) : (
              <>
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                Location to be announced
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5 font-mono">
            <Users className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
            {event.min_team_size}–{event.max_team_size} per team
          </span>
        </div>
      </div>
    </Link>
  );
}
