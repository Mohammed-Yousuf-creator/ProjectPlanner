import { useParams } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { EventWorkspaceNav } from '@/components/domain/EventWorkspaceNav';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useAuthStore } from '@/stores/authStore';
import { formatRelative, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';

/** Audience-targeted announcement feed. The backend already filters by role. */
export function EventAnnouncementsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const { data, isLoading, isError, error, refetch } = useAnnouncements(eventId, isAuthenticated);

  return (
    <div className="space-y-6">
      <EventWorkspaceNav eventId={eventId ?? ''} isAuthenticated={isAuthenticated} />
      <PageHeader
        eyebrow="Updates"
        title="Announcements"
        description="Only announcements addressed to your role in this event are shown."
      />

      {isLoading ? (
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <SkeletonLines lines={6} />
        </div>
      ) : isError ? (
        toApiError(error).status === 403 ? (
          <EmptyState
            icon={Megaphone}
            title="Announcements are for event members"
            description="Register for this event, or sign in with an organizer or judge account, to read announcements."
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Organizers publish updates here as the event approaches. Nothing has been posted for your audience so far."
        />
      ) : (
        <div className="space-y-3">
          {data.map((announcement) => (
            <article
              key={announcement.id}
              className="space-y-2 rounded-2xl border border-line bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="category">{humanizeEnum(announcement.audience_type)}</Badge>
                  <StatusBadge status={announcement.status} />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  {announcement.published_at
                    ? `Published ${formatRelative(announcement.published_at)}`
                    : `Draft · updated ${formatRelative(announcement.updated_at)}`}
                </span>
              </div>
              <h2 className="text-base font-bold text-ink">{announcement.title}</h2>
              <p className="whitespace-pre-line text-xs leading-relaxed text-taupe">
                {announcement.body}
              </p>
            </article>
          ))}
          {data.some((item) => item.status === 'draft') && (
            <Alert tone="info">
              Drafts are visible to organizers only — recipients see them after publishing.
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
