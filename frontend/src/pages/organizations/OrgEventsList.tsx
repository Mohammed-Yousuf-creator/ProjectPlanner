import { Link } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { useOrganizationEvents } from '@/hooks/useOrganizations';
import { formatDateRange, humanizeEnum } from '@/lib/format';
import { canManageOrganization } from '@/lib/permissions';

/** Organizer-facing event list including drafts (unlike the public `/events`). */
export function OrgEventsList({ orgId, myRole }: { orgId: string; myRole: string | null }) {
  const { data, isLoading, isError, error, refetch } = useOrganizationEvents(orgId);
  const canCreate = canManageOrganization(myRole);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5">
        <CardHeader
          title="Events"
          description="Includes drafts and private events. Only owners and admins can create events."
          actions={
            canCreate ? (
              <Link to={`/organizations/${orgId}/events/new`}>
                <Button size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                  Create event
                </Button>
              </Link>
            ) : undefined
          }
        />
      </div>

      {isLoading ? (
        <div className="p-5">
          <SkeletonTable rows={4} />
        </div>
      ) : isError ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="p-5">
          <EmptyState
            inline
            icon={CalendarDays}
            title="No events yet"
            description={
              canCreate
                ? 'Create a draft event, then publish it when the details are final.'
                : 'An owner or admin of this organization has to create the first event.'
            }
            actions={
              canCreate ? (
                <Link to={`/organizations/${orgId}/events/new`}>
                  <Button>Create the first event</Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {data.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={event.status} />
                  <Badge variant="neutral">{humanizeEnum(event.format)}</Badge>
                  <Badge variant="category">{humanizeEnum(event.event_type)}</Badge>
                </div>
                <p className="mt-1 text-xs font-bold text-ink">{event.name}</p>
                <p className="font-mono text-[11px] text-taupe">
                  {formatDateRange(event.starts_at, event.ends_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/events/${event.id}`}>
                  <Button variant="chip" size="sm">
                    Public page
                  </Button>
                </Link>
                <Link to={`/manage/events/${event.id}`}>
                  <Button size="sm">Manage</Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
