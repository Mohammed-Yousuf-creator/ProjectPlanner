import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, CalendarX2, Send, Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/Badge';
import { EventMeta } from '@/components/domain/EventMeta';
import { useToast } from '@/components/ui/Toast';
import { useCancelEvent, usePublishEvent } from '@/hooks/useEvents';
import { toApiError } from '@/lib/errors';
import type { EventRead } from '@/api/types';

/** Event lifecycle: publish (validated, irreversible state change) and cancel. */
export function ManageOverviewTab({ event }: { event: EventRead }) {
  const toast = useToast();
  const publish = usePublishEvent(event.id);
  const cancel = useCancelEvent(event.id);

  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const canPublish = event.status === 'draft';
  const canCancel = event.status !== 'cancelled' && event.status !== 'completed';

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader
            title="Lifecycle"
            description="Drafts are invisible to the public until published."
            actions={<StatusBadge status={event.status} />}
          />
          <div className="space-y-3 pt-3">
            <p className="text-xs leading-relaxed text-taupe">
              Publishing validates the timezone, timing, format and venue fields on the server.
              Cancelling is permanent — a cancelled event can never be re-published.
            </p>

            {publishError && (
              <Alert tone="error" title="Publishing failed">
                {publishError}
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {canPublish ? (
                <Button
                  onClick={() => {
                    setPublishError(null);
                    setConfirmPublish(true);
                  }}
                  icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Publish event
                </Button>
              ) : (
                <Button disabled icon={<CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />}>
                  {event.status === 'draft' ? 'Already published' : 'No publish action available'}
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmCancel(true)}
                  icon={<CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Cancel event
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Description" description="Shown on the public event page." />
          <div className="pt-3">
            {event.description ? (
              <p className="whitespace-pre-line text-xs leading-relaxed text-taupe">
                {event.description}
              </p>
            ) : (
              <p className="text-xs text-muted">No long description yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid gap-2 pt-3 sm:grid-cols-2">
            <Link to={`/events/${event.id}/leaderboard`}>
              <Button variant="outline" block>
                View leaderboard
              </Button>
            </Link>
            <Link to={`/events/${event.id}/projects`}>
              <Button variant="outline" block>
                Submitted projects
              </Button>
            </Link>
            <Link to={`/judge/events/${event.id}`}>
              <Button variant="outline" block>
                Judge workspace
              </Button>
            </Link>
            <Link to={`/events/${event.id}/teams`}>
              <Button variant="outline" block icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}>
                Team discovery
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Event facts" />
          <div className="pt-1">
            <EventMeta event={event} />
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() =>
          publish.mutate(undefined, {
            onSuccess: () => {
              toast.success('Event published. It is now discoverable.');
              setConfirmPublish(false);
            },
            onError: (error) => {
              setPublishError(toApiError(error).message);
              setConfirmPublish(false);
            },
          })
        }
        title="Publish this event?"
        description="The event becomes visible on public discovery pages."
        confirmLabel="Publish"
        loading={publish.isPending}
      >
        <p>
          The server checks that the event has valid timing, a timezone, a format and venue details.
          Any failure is shown verbatim so you can fix the exact field.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() =>
          cancel.mutate(undefined, {
            onSuccess: () => {
              toast.success('Event cancelled.');
              setConfirmCancel(false);
            },
            onError: (error) => {
              setConfirmCancel(false);
              toast.error(toApiError(error).message);
            },
          })
        }
        title="Cancel this event?"
        description="Cancelling cannot be undone."
        confirmLabel="Cancel event"
        destructive
        loading={cancel.isPending}
      >
        <p>
          Cancelled events stay in your organization list but are removed from public discovery and
          can never be re-published.
        </p>
      </ConfirmDialog>
    </div>
  );
}
