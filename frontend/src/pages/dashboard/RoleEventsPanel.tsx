import { Link } from 'react-router-dom';
import { Gavel, LifeBuoy, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useMyJudgingEvents, useMyMentoringEvents } from '@/hooks/useRoleEvents';
import { formatDateRange, humanizeEnum } from '@/lib/format';
import type { EventRead } from '@/api/types';

type RoleKind = 'judge' | 'mentor';

const COPY: Record<
  RoleKind,
  { label: string; eyebrow: string; icon: typeof Gavel; href: (id: string) => string; empty: string }
> = {
  judge: {
    label: 'Judging',
    eyebrow: 'Events you judge',
    icon: Gavel,
    href: (id) => `/judge/events/${id}`,
    empty: 'No judging assignments yet. An organizer adds judges by email.',
  },
  mentor: {
    label: 'Mentoring',
    eyebrow: 'Events you mentor',
    icon: LifeBuoy,
    href: (id) => `/events/${id}/mentor`,
    empty: 'No mentoring assignments yet. Organizers assign you to participant requests.',
  },
};

function RoleEventList({ kind, events }: { kind: RoleKind; events: EventRead[] }) {
  const copy = COPY[kind];

  return (
    <ul className="space-y-2">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            to={copy.href(event.id)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-line-subtle bg-canvas p-3 transition-colors hover:border-rust/40 hover:bg-white"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="category">{humanizeEnum(event.event_type)}</Badge>
                <StatusBadge status={event.status} />
              </div>
              <p className="mt-1.5 truncate text-xs font-bold text-ink group-hover:text-rust">
                {event.name}
              </p>
              <p className="font-mono text-[10px] text-muted">
                {formatDateRange(event.starts_at, event.ends_at)}
              </p>
            </div>
            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rust"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Discovery for the judge and mentor roles.
 *
 * Both lists come from dedicated endpoints (`/users/me/judging-events`,
 * `/users/me/mentoring-events`). The panel renders nothing while loading or
 * when the user holds neither role, so a plain participant's dashboard keeps
 * its original four sections.
 */
export function RoleEventsPanel() {
  const judging = useMyJudgingEvents();
  const mentoring = useMyMentoringEvents();

  const judgingEvents = judging.data ?? [];
  const mentoringEvents = mentoring.data ?? [];
  const isLoading = judging.isLoading || mentoring.isLoading;
  const hasAny = judgingEvents.length > 0 || mentoringEvents.length > 0;

  if (isLoading) {
    return (
      <Card>
        <SkeletonLines lines={2} className="max-w-sm" />
      </Card>
    );
  }
  if (!hasAny) return null;

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      {(Object.keys(COPY) as RoleKind[]).map((kind) => {
        const events = kind === 'judge' ? judgingEvents : mentoringEvents;
        if (events.length === 0) return null;
        const copy = COPY[kind];
        const Icon = copy.icon;
        return (
          <Card key={kind} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest/10 text-forest">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-ink">{copy.eyebrow}</h3>
                  <p className="text-[11px] text-taupe">
                    {events.length} {events.length === 1 ? 'event' : 'events'} as {copy.label.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>
            <RoleEventList kind={kind} events={events} />
          </Card>
        );
      })}
    </section>
  );
}

/** Rendered inside a card body when the panel is used standalone. */
export function RoleEventsEmptyHint() {
  return (
    <EmptyState
      inline
      icon={Gavel}
      title="No role assignments"
      description="Judging and mentoring assignments appear here once an organizer grants them."
    />
  );
}
