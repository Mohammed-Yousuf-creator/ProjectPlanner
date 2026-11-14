import { Route } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useEventTracks } from '@/hooks/useTracks';

/** Event tracks - `GET /events/{id}/tracks` is public for published events. */
export function TrackList({ eventId }: { eventId: string }) {
  const { data, isLoading, isError, error, refetch } = useEventTracks(eventId);

  if (isLoading) return <SkeletonLines lines={4} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        inline
        icon={Route}
        title="No tracks announced"
        description="The organizers have not published competition tracks for this event yet."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((track, index) => (
        <li
          key={track.id}
          className="flex items-start gap-3 rounded-xl border border-line-subtle bg-canvas px-3 py-2.5"
        >
          <Badge variant="category" className="mt-0.5">
            {String(index + 1).padStart(2, '0')}
          </Badge>
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink">{track.name}</p>
            {track.description ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-taupe">{track.description}</p>
            ) : (
              <p className="mt-0.5 text-[11px] text-muted">No description provided.</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
