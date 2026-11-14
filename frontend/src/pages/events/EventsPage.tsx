import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarSearch } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EventCard } from '@/components/domain/EventCard';
import { useEvents } from '@/hooks/useEvents';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { EventFilters, type EventFilterValues } from './EventFilters';

/**
 * Public event discovery. Filter state lives in the query string so results are
 * shareable and the back button behaves, per PLAN.md Phase 4.
 */
export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: EventFilterValues = useMemo(
    () => ({
      event_type: searchParams.get('event_type') ?? '',
      format: searchParams.get('format') ?? '',
      city: searchParams.get('city') ?? '',
    }),
    [searchParams],
  );

  const offset = Number(searchParams.get('offset') ?? '0') || 0;
  const [cityDraft, setCityDraft] = useState(filters.city);
  useEffect(() => setCityDraft(filters.city), [filters.city]);

  const query = useEvents({
    event_type: filters.event_type || undefined,
    format: filters.format || undefined,
    city: filters.city || undefined,
    limit: DEFAULT_PAGE_SIZE,
    offset,
  });

  const updateParams = useCallback(
    (patch: Record<string, string | number | undefined>, resetOffset = true) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (resetOffset && !('offset' in patch)) next.delete('offset');
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  // Debounce the city box so we do not fire a request per keystroke.
  useEffect(() => {
    if (cityDraft === filters.city) return;
    const timer = window.setTimeout(() => updateParams({ city: cityDraft || undefined }), 400);
    return () => window.clearTimeout(timer);
  }, [cityDraft, filters.city, updateParams]);

  const hasActiveFilters = Boolean(filters.event_type || filters.format || filters.city);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discover"
        title="Events"
        description="Every published, publicly visible event on the platform. Use filters to narrow the list."
      />

      <EventFilters
        values={{ ...filters, city: cityDraft }}
        onChange={(patch) => {
          if (patch.city !== undefined) {
            setCityDraft(patch.city);
            return;
          }
          updateParams(patch as Record<string, string | undefined>);
        }}
        onReset={() => {
          setCityDraft('');
          setSearchParams(new URLSearchParams(), { replace: false });
        }}
        hasActiveFilters={hasActiveFilters}
      />

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState
          icon={CalendarSearch}
          title={hasActiveFilters ? 'No events match these filters' : 'No events published yet'}
          description={
            hasActiveFilters
              ? 'Try a different city, format or event type — or clear the filters to see everything.'
              : 'Organizers have not published a public event yet. New events appear here as soon as they go live.'
          }
          actions={
            hasActiveFilters ? (
              <button
                type="button"
                className="text-xs font-semibold text-rust hover:underline"
                onClick={() => {
                  setCityDraft('');
                  setSearchParams(new URLSearchParams(), { replace: false });
                }}
              >
                Clear all filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={DEFAULT_PAGE_SIZE}
            pageItemCount={query.data.length}
            onChange={(nextOffset) => updateParams({ offset: nextOffset || undefined }, false)}
            disabled={query.isFetching}
          />
        </>
      )}
    </div>
  );
}
