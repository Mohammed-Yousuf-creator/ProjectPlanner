import { CalendarClock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { ScheduleItemRow } from '@/components/domain/ScheduleItemRow';
import { useSchedule } from '@/hooks/useSchedule';

/** First three agenda items on the event overview page. */
export function SchedulePreview({ eventId }: { eventId: string }) {
  const { data, isLoading, isError, error, refetch } = useSchedule(eventId);

  if (isLoading) return <SkeletonLines lines={5} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        inline
        icon={CalendarClock}
        title="No schedule published"
        description="The agenda appears here once the organizers add sessions."
      />
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 3).map((item) => (
        <ScheduleItemRow key={item.id} item={item} />
      ))}
      {data.length > 3 && (
        <p className="pt-1 text-[11px] text-muted">
          Showing 3 of {data.length} agenda items. Open the schedule tab for the full agenda.
        </p>
      )}
    </div>
  );
}
