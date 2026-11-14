import { CalendarClock, Globe2, MapPin, Timer, Users2 } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { EventRead } from '@/api/types';

function MetaRow({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-line-subtle py-2.5 last:border-b-0">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-0.5 break-words text-xs font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}

/** The event fact sheet shared by public and participant event pages. */
export function EventMeta({ event }: { event: EventRead }) {
  const venue = [event.venue_name, event.address, event.city, event.country]
    .filter(Boolean)
    .join(', ');

  return (
    <div>
      <MetaRow
        icon={CalendarClock}
        label="Event window"
        value={`${formatDateTime(event.starts_at)} → ${formatDateTime(event.ends_at)}`}
      />
      <MetaRow
        icon={Timer}
        label="Registration"
        value={
          event.registration_opens_at || event.registration_closes_at
            ? `${formatDateTime(event.registration_opens_at)} → ${formatDateTime(event.registration_closes_at)}`
            : 'No registration window configured'
        }
      />
      <MetaRow
        icon={Timer}
        label="Submission deadline"
        value={
          event.submission_deadline_at
            ? formatDateTime(event.submission_deadline_at)
            : 'Not announced'
        }
      />
      <MetaRow
        icon={event.format === 'online' ? Globe2 : MapPin}
        label={event.format === 'online' ? 'Format' : 'Venue'}
        value={event.format === 'online' ? 'Online' : venue || 'Venue to be announced'}
      />
      <MetaRow
        icon={Users2}
        label="Team size"
        value={`${event.min_team_size} minimum, ${event.max_team_size} maximum`}
      />
      <MetaRow icon={Globe2} label="Timezone" value={event.timezone} />
    </div>
  );
}
