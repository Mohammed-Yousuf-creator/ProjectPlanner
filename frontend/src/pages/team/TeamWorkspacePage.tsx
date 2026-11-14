import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, WifiOff } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { StatusDot } from '@/components/ui/StatusDot';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { useTeam } from '@/hooks/useTeams';
import { useTeamSocket } from '@/hooks/useTeamSocket';
import { useAuthStore } from '@/stores/authStore';
import { myTeamMembership } from '@/lib/permissions';
import { toApiError } from '@/lib/errors';
import { TeamOverviewTab } from './TeamOverviewTab';
import { TeamBoardTab } from './TeamBoardTab';
import { TeamChatTab } from './TeamChatTab';
import { TeamFilesTab } from './TeamFilesTab';
import { TeamProjectTab } from './TeamProjectTab';

type TabValue = 'overview' | 'board' | 'chat' | 'files' | 'project';

/**
 * `/teams/:teamId` - tabbed workspace. Non-members receive `members: null` from
 * the API, which we treat as a read-only overview rather than an error.
 */
export function TeamWorkspacePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const userId = useAuthStore((state) => state.user?.id);
  const [tab, setTab] = useState<TabValue>('overview');

  const teamQuery = useTeam(teamId);
  const socket = useTeamSocket(teamId, {
    onAccessRevoked: () => {
      void teamQuery.refetch();
    },
  });

  const membership = useMemo(
    () => myTeamMembership(teamQuery.data, userId),
    [teamQuery.data, userId],
  );
  const isMember = Boolean(membership);

  const tabs: TabItem[] = [
    { value: 'overview', label: 'Overview' },
    ...(isMember
      ? ([
          { value: 'board', label: 'Board' },
          { value: 'chat', label: 'Chat' },
          { value: 'files', label: 'Files' },
          { value: 'project', label: 'Project' },
        ] as TabItem[])
      : []),
  ];

  if (teamQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-md" />
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <SkeletonLines lines={8} />
        </div>
      </div>
    );
  }

  if (teamQuery.isError) {
    const apiError = toApiError(teamQuery.error);
    if (apiError.status === 403 || apiError.status === 404) {
      return (
        <EmptyState
          icon={LockKeyhole}
          title="Team unavailable"
          description={apiError.message}
          actions={
            <>
              <Link to="/my/registrations">
                <Button variant="outline">My registrations</Button>
              </Link>
              <Link to="/dashboard">
                <Button>Dashboard</Button>
              </Link>
            </>
          }
        />
      );
    }
    return <ErrorState error={teamQuery.error} onRetry={() => void teamQuery.refetch()} />;
  }

  const team = teamQuery.data;
  if (!team) return null;

  const connectionLabel =
    socket.status === 'authenticated'
      ? 'Live'
      : socket.status === 'connecting' || socket.status === 'open'
        ? 'Connecting…'
        : 'Offline';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={`/events/${team.event_id}/teams`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-taupe transition-colors hover:text-rust"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Back to teams
        </Link>
        {isMember && (
          <StatusDot
            tone={socket.status === 'authenticated' ? 'live' : socket.status === 'closed' ? 'offline' : 'warning'}
            label={`Team updates: ${connectionLabel}`}
          />
        )}
      </div>

      <PageHeader
        eyebrow="Team workspace"
        title={team.name}
        description={team.description ?? 'No team description provided.'}
        breadcrumbs={[
          { label: 'Events', to: '/events' },
          { label: 'Teams', to: `/events/${team.event_id}/teams` },
          { label: team.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={team.status} />
            <span className="rounded-lg border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-taupe">
              {team.member_count}/{team.max_team_size} members
            </span>
            <Link to={`/events/${team.event_id}`}>
              <Button variant="chip" size="sm">
                Event page
              </Button>
            </Link>
          </div>
        }
      />

      {socket.accessRevoked && (
        <Alert tone="error" title="Live updates disconnected">
          You no longer have access to this team's live updates. Refresh the team to confirm your
          membership.
        </Alert>
      )}

      {isMember && socket.retryExhausted && !socket.accessRevoked && (
        <Alert
          tone="warning"
          title="Live updates are offline"
          actions={
            <Button variant="outline" size="sm" onClick={socket.reconnect} icon={<WifiOff className="h-3 w-3" aria-hidden="true" />}>
              Reconnect
            </Button>
          }
        >
          The real-time connection could not be re-established after several attempts. Data still
          refreshes when you navigate or reload.
        </Alert>
      )}

      {!isMember && (
        <Alert tone="info" title="You are viewing this team as an event participant">
          Join the team with a join code, or accept an invitation, to access the board, chat, files
          and project.
        </Alert>
      )}

      <Tabs tabs={tabs} value={tab} onChange={(value) => setTab(value as TabValue)} aria-label="Team sections" />

      {tab === 'overview' && (
        <TeamOverviewTab team={team} membership={membership} />
      )}
      {tab === 'board' && isMember && (
        <TeamBoardTab team={team} membership={membership} />
      )}
      {tab === 'chat' && isMember && <TeamChatTab team={team} membership={membership} />}
      {tab === 'files' && isMember && <TeamFilesTab team={team} />}
      {tab === 'project' && isMember && (
        <TeamProjectTab team={team} membership={membership} />
      )}
    </div>
  );
}
