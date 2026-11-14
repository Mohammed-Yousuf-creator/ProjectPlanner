import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useEvent } from '@/hooks/useEvents';
import { useMyOrganizations } from '@/hooks/useOrganizations';
import { findMyOrganizationRole } from '@/lib/permissions';
import { toApiError } from '@/lib/errors';
import { humanizeEnum } from '@/lib/format';
import { ManageOverviewTab } from './ManageOverviewTab';
import { ManageTracksTab } from './ManageTracksTab';
import { ManageParticipantsTab } from './ManageParticipantsTab';
import { ManageCheckInTab } from './ManageCheckInTab';
import { ManageScheduleTab } from './ManageScheduleTab';
import { ManageAnnouncementsTab } from './ManageAnnouncementsTab';
import { ManageJudgingTab } from './ManageJudgingTab';
import { ManageMentorTab } from './ManageMentorTab';

const TABS: TabItem[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'tracks', label: 'Tracks' },
  { value: 'participants', label: 'Participants' },
  { value: 'check-in', label: 'Check-in' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'judging', label: 'Judges & criteria' },
  { value: 'mentor', label: 'Mentor requests' },
];

/**
 * Organizer console. Every tab is owner/admin-only on the server; a 403 from the
 * event fetch is rendered as an explicit access message rather than a blank page.
 */
export function ManageEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [tab, setTab] = useState('overview');
  const eventQuery = useEvent(eventId);
  const mine = useMyOrganizations();

  const myRole = findMyOrganizationRole(mine.data, eventQuery.data?.organization_id);
  const canManage = myRole === 'owner' || myRole === 'admin';

  if (eventQuery.isLoading || mine.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-lg" />
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <SkeletonLines lines={8} />
        </div>
      </div>
    );
  }

  if (eventQuery.isError) {
    const apiError = toApiError(eventQuery.error);
    if (apiError.status === 403 || apiError.status === 404) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title="Organizer access required"
          description="This console is limited to owners and admins of the organizing organization."
          actions={
            <Link to="/organizations">
              <Button variant="outline">My organizations</Button>
            </Link>
          }
        />
      );
    }
    return <ErrorState error={eventQuery.error} onRetry={() => void eventQuery.refetch()} />;
  }

  const event = eventQuery.data;
  if (!event) return null;

  if (!canManage) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Organizer access required"
        description="Your account is not an owner or admin of the organization hosting this event."
        actions={
          <>
            <Link to={`/events/${event.id}`}>
              <Button variant="outline">View public event</Button>
            </Link>
            <Link to="/organizations">
              <Button>My organizations</Button>
            </Link>
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Organizer console"
        title={event.name}
        description={`${humanizeEnum(event.event_type)} · ${humanizeEnum(event.format)} · ${event.timezone}`}
        breadcrumbs={[
          { label: 'Organizations', to: '/organizations' },
          { label: 'Organization', to: `/organizations/${event.organization_id}` },
          { label: 'Manage event' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <StatusBadge status={event.visibility} variant="neutral" />
            <Link to={`/events/${event.id}`}>
              <Button variant="chip" size="sm">
                Public page
              </Button>
            </Link>
          </div>
        }
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} aria-label="Organizer sections" />

      {tab === 'overview' && <ManageOverviewTab event={event} />}
      {tab === 'tracks' && <ManageTracksTab eventId={event.id} />}
      {tab === 'participants' && <ManageParticipantsTab eventId={event.id} />}
      {tab === 'check-in' && <ManageCheckInTab eventId={event.id} />}
      {tab === 'schedule' && <ManageScheduleTab eventId={event.id} />}
      {tab === 'announcements' && <ManageAnnouncementsTab eventId={event.id} />}
      {tab === 'judging' && <ManageJudgingTab eventId={event.id} />}
      {tab === 'mentor' && <ManageMentorTab eventId={event.id} />}
    </div>
  );
}
