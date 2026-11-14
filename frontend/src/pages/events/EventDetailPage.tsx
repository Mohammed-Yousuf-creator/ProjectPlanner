import { Link, useParams } from 'react-router-dom';
import { CalendarX, ExternalLink, Scale, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EventMeta } from '@/components/domain/EventMeta';
import { EventWorkspaceNav } from '@/components/domain/EventWorkspaceNav';
import { RegistrationButton } from '@/components/domain/RegistrationButton';
import { TrackList } from '@/components/domain/TrackList';
import { SchedulePreview } from './SchedulePreview';
import { useEvent } from '@/hooks/useEvents';
import { useMyRegistrations } from '@/hooks/useParticipant';
import { useAuthStore } from '@/stores/authStore';
import { humanizeEnum, isSafeHttpUrl } from '@/lib/format';
import { toApiError } from '@/lib/errors';

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const eventQuery = useEvent(eventId);
  const registrationsQuery = useMyRegistrations(isAuthenticated);

  const registration = registrationsQuery.data?.find((item) => item.event_id === eventId);

  if (eventQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-lg" />
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <SkeletonLines lines={6} />
        </div>
      </div>
    );
  }

  if (eventQuery.isError) {
    const apiError = toApiError(eventQuery.error);
    if (apiError.status === 404 || apiError.status === 403) {
      return (
        <EmptyState
          icon={CalendarX}
          title="This event isn't available"
          description="It may still be a draft, may have been cancelled, or may be private to the organizing team."
          actions={
            <Link to="/events">
              <Button variant="outline">Back to events</Button>
            </Link>
          }
        />
      );
    }
    return <ErrorState error={eventQuery.error} onRetry={() => void eventQuery.refetch()} />;
  }

  const event = eventQuery.data;
  if (!event) return null;

  return (
    <div className="space-y-6">
      <EventWorkspaceNav eventId={event.id} isAuthenticated={isAuthenticated} />

      <PageHeader
        eyebrow={humanizeEnum(event.event_type)}
        title={event.name}
        description={event.short_description ?? undefined}
        breadcrumbs={[
          { label: 'Events', to: '/events' },
          { label: event.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <StatusBadge status={event.format} variant="neutral" />
            <Link to={`/judge/events/${event.id}`}>
              <Button variant="chip" icon={<Scale className="h-3.5 w-3.5" aria-hidden="true" />}>
                Judge workspace
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="About this event" />
            <div className="pt-3">
              {event.description ? (
                <p className="whitespace-pre-line text-xs leading-relaxed text-taupe">
                  {event.description}
                </p>
              ) : (
                <p className="text-xs text-muted">
                  The organizers have not added a long description yet.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Tracks"
              description="Competition tracks published for this event."
              actions={
                <Badge variant="neutral">{humanizeEnum(event.format)}</Badge>
              }
            />
            <div className="pt-3">
              <TrackList eventId={event.id} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Schedule preview" description="The next sessions on the agenda." />
            <div className="pt-3">
              <SchedulePreview eventId={event.id} />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Registration" />
            <div className="space-y-3 pt-3">
              <RegistrationButton
                event={event}
                registrationStatus={registration?.registration_status ?? null}
                manageHref={registration ? `/my/events/${event.id}` : undefined}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Key details" />
            <div className="pt-1">
              <EventMeta event={event} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Jump to" />
            <div className="flex flex-col gap-2 pt-3">
              <Link to={`/events/${event.id}/teams`}>
                <Button variant="outline" block icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}>
                  Teams for this event
                </Button>
              </Link>
              <Link to={`/events/${event.id}/projects`}>
                <Button variant="outline" block>
                  Submitted projects
                </Button>
              </Link>
              <Link to={`/events/${event.id}/leaderboard`}>
                <Button variant="outline" block>
                  Leaderboard
                </Button>
              </Link>
              {isSafeHttpUrl(event.venue_name) && (
                <a href={event.venue_name ?? undefined} target="_blank" rel="noopener noreferrer">
                  <Button variant="chip" block icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}>
                    Venue link
                  </Button>
                </a>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
