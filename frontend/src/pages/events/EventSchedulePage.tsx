import { useParams } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { ScheduleItemRow } from '@/components/domain/ScheduleItemRow';
import { EventWorkspaceNav } from '@/components/domain/EventWorkspaceNav';
import { useSchedule } from '@/hooks/useSchedule';
import { useAuthStore } from '@/stores/authStore';
import { groupByLocalDate } from '@/lib/format';

/** Public agenda, grouped by the viewer's local date. */
export function EventSchedulePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const { data, isLoading, isError, error, refetch } = useSchedule(eventId);

  const groups = groupByLocalDate(data ?? [], (item) => item.starts_at);

  return (
    <div className="space-y-6">
      <EventWorkspaceNav eventId={eventId ?? ''} isAuthenticated={isAuthenticated} />
      <PageHeader
        eyebrow="Agenda"
        title="Event schedule"
        description="All active sessions, grouped by date in your local timezone."
      />

      {isLoading ? (
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <SkeletonLines lines={6} />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No schedule published yet"
          description="Once the organizers add agenda items they appear here in chronological order."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="font-mono text-[11px] uppercase tracking-wider text-rust">
                {group.label}
              </h2>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <ScheduleItemRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
