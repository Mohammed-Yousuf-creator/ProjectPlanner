import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, LockKeyhole } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EventMeta } from '@/components/domain/EventMeta';
import { useMyRegisteredEvent } from '@/hooks/useParticipant';
import { toApiError } from '@/lib/errors';
import { formatDateTime, humanizeEnum } from '@/lib/format';

/** Registered-participant view. 403 means the registration is no longer active. */
export function MyEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data, isLoading, isError, error, refetch } = useMyRegisteredEvent(eventId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-md" />
        <Card>
          <SkeletonLines lines={8} />
        </Card>
      </div>
    );
  }

  if (isError) {
    const apiError = toApiError(error);
    if (apiError.status === 403 || apiError.status === 404) {
      return (
        <EmptyState
          icon={LockKeyhole}
          title="This event is not in your active registrations"
          description="Your registration may have been withdrawn or rejected, or it does not exist for this account."
          actions={
            <>
              <Link to={`/events/${eventId}`}>
                <Button variant="outline">Open public event page</Button>
              </Link>
              <Link to="/my/registrations">
                <Button>My registrations</Button>
              </Link>
            </>
          }
        />
      );
    }
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (!data) return null;

  const answers = Object.entries((data.registration_data ?? {}) as Record<string, unknown>);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={humanizeEnum(data.event.event_type)}
        title={data.event.name}
        description={data.event.short_description ?? undefined}
        breadcrumbs={[
          { label: 'My registrations', to: '/my/registrations' },
          { label: data.event.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={data.registration_status} />
            <Link to={`/events/${data.event.id}`}>
              <Button variant="outline" size="sm">
                Public page
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Your registration" />
            <dl className="grid gap-3 pt-3 sm:grid-cols-2">
              <Detail label="Status" value={humanizeEnum(data.registration_status)} />
              <Detail label="Registered at" value={formatDateTime(data.registered_at)} mono />
              <Detail
                label="Checked in at"
                value={data.checked_in_at ? formatDateTime(data.checked_in_at) : 'Not checked in'}
                mono={Boolean(data.checked_in_at)}
              />
              <Detail label="Organizer" value={data.organization.name} />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Custom answers"
              description="What you submitted when registering."
            />
            <div className="pt-3">
              {answers.length === 0 ? (
                <p className="text-xs text-muted">
                  No custom registration answers were submitted for this event.
                </p>
              ) : (
                <dl className="divide-y divide-line-subtle">
                  {answers.map(([key, value]) => (
                    <div key={key} className="flex flex-wrap justify-between gap-2 py-2">
                      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        {key}
                      </dt>
                      <dd className="text-xs text-ink">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Tracks" />
            <div className="pt-3">
              {data.tracks.length === 0 ? (
                <p className="text-xs text-muted">No tracks have been published for this event.</p>
              ) : (
                <ul className="space-y-2">
                  {data.tracks.map((track) => (
                    <li key={track.id} className="rounded-xl border border-line-subtle bg-canvas p-3">
                      <p className="text-xs font-bold text-ink">{track.name}</p>
                      {track.description && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-taupe">
                          {track.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Event details" />
            <div className="pt-1">
              <EventMeta event={data.event} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Next steps" />
            <div className="flex flex-col gap-2 pt-3">
              <Link to={`/events/${data.event.id}/teams`}>
                <Button variant="outline" block icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}>
                  Find or create a team
                </Button>
              </Link>
              <Link to={`/events/${data.event.id}/announcements`}>
                <Button variant="outline" block>
                  Read announcements
                </Button>
              </Link>
              <Link to={`/events/${data.event.id}/schedule`}>
                <Button variant="chip" block>
                  Event schedule
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={mono ? 'font-mono text-xs text-ink' : 'text-xs font-medium text-ink'}>{value}</dd>
    </div>
  );
}
