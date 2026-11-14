import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { EventWorkspaceNav } from '@/components/domain/EventWorkspaceNav';
import { TeamCard } from '@/components/domain/TeamCard';
import { JoinCodeModal } from '@/components/domain/JoinCodeModal';
import { CreateTeamModal } from './CreateTeamModal';
import { JoinTeamModal } from './JoinTeamModal';
import { useEventTeams } from '@/hooks/useTeams';
import { useMyTeamForEvent } from '@/hooks/useMyTeamForEvent';
import { useMyRegistrations } from '@/hooks/useParticipant';
import { useEvent } from '@/hooks/useEvents';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/Toast';
import { canParticipateInTeams } from '@/lib/registration';
import { toApiError } from '@/lib/errors';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import type { TeamCreatedResponse, TeamDiscoveryItem } from '@/api/types';

/**
 * Team discovery for one event. Requires a registered/approved registration —
 * the backend returns 403 otherwise, which we turn into actionable copy.
 */
export function EventTeamsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));

  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<TeamDiscoveryItem | null>(null);
  const [createdTeam, setCreatedTeam] = useState<TeamCreatedResponse | null>(null);

  const eventQuery = useEvent(eventId);
  const registrations = useMyRegistrations(isAuthenticated);
  const registration = registrations.data?.find((item) => item.event_id === eventId);
  const participationStatus = registration?.registration_status;
  const canBrowse = canParticipateInTeams(participationStatus);

  const teamsQuery = useEventTeams(eventId, { limit: DEFAULT_PAGE_SIZE, offset });
  const myTeamQuery = useMyTeamForEvent(eventId, isAuthenticated && canBrowse);

  const teamsError = teamsQuery.isError ? toApiError(teamsQuery.error) : null;

  return (
    <div className="space-y-6">
      <EventWorkspaceNav eventId={eventId ?? ''} isAuthenticated={isAuthenticated} />
      <PageHeader
        eyebrow={eventQuery.data?.name ?? 'Teams'}
        title="Teams"
        description="Browse teams forming for this event, join with a code, or start your own."
        breadcrumbs={[
          { label: 'Events', to: '/events' },
          { label: eventQuery.data?.name ?? 'Event', to: `/events/${eventId}` },
          { label: 'Teams' },
        ]}
        actions={
          canBrowse ? (
            <Button onClick={() => setCreateOpen(true)} icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
              Create team
            </Button>
          ) : undefined
        }
      />

      {!canBrowse && !registrations.isLoading && (
        <Alert
          tone="info"
          title="Register for this event to browse teams"
          actions={
            <Link to={`/events/${eventId}`}>
              <Button variant="outline" size="sm">
                Open event
              </Button>
            </Link>
          }
        >
          Team discovery is limited to registered or approved participants of the event.
        </Alert>
      )}

      {myTeamQuery.data && (
        <Card className="space-y-3 border-forest/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-forest">
                Your team in this event
              </p>
              <p className="text-base font-bold text-ink">{myTeamQuery.data.name}</p>
              <p className="text-[11px] text-taupe">
                {myTeamQuery.data.member_count} of {myTeamQuery.data.max_team_size} members · status{' '}
                {myTeamQuery.data.status}
              </p>
            </div>
            <Link to={`/teams/${myTeamQuery.data.id}`}>
              <Button>Open team workspace</Button>
            </Link>
          </div>
        </Card>
      )}

      {canBrowse &&
        (teamsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : teamsQuery.isError ? (
          teamsError?.status === 403 ? (
            <EmptyState
              icon={Users}
              title="Register for this event to browse teams"
              description="The team list is only available to registered or approved participants."
              actions={
                <Link to={`/events/${eventId}`}>
                  <Button>Register for this event</Button>
                </Link>
              }
            />
          ) : (
            <ErrorState error={teamsQuery.error} onRetry={() => void teamsQuery.refetch()} />
          )
        ) : !teamsQuery.data || teamsQuery.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No teams formed yet"
            description="Be the first: create a team, then share the join code with teammates."
            actions={
              <Button onClick={() => setCreateOpen(true)}>Create the first team</Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teamsQuery.data.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  isMyTeam={myTeamQuery.data?.id === team.id}
                  onJoin={
                    myTeamQuery.data ? undefined : () => setJoinTarget(team)
                  }
                  joinDisabled={Boolean(myTeamQuery.data)}
                />
              ))}
            </div>
            <Pagination
              offset={offset}
              limit={DEFAULT_PAGE_SIZE}
              pageItemCount={teamsQuery.data.length}
              onChange={setOffset}
            />
          </>
        ))}
      {myTeamQuery.data && (
        <p className="text-[11px] text-muted">
          You can belong to one active team per event. Leave your current team before joining another.
        </p>
      )}

      <CreateTeamModal
        eventId={eventId ?? ''}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(team) => {
          setCreateOpen(false);
          setCreatedTeam(team);
          void teamsQuery.refetch();
          void myTeamQuery.refetch();
        }}
      />

      <JoinTeamModal
        eventId={eventId ?? ''}
        team={joinTarget}
        onClose={() => setJoinTarget(null)}
        onJoined={() => {
          const joinedName = joinTarget?.name;
          setJoinTarget(null);
          toast.success(`Joined ${joinedName ?? 'the team'}.`);
          void teamsQuery.refetch();
          void myTeamQuery.refetch();
          navigate(`/my/team-invitations`);
        }}
      />

      {createdTeam?.join_code && (
        <JoinCodeModal
          open
          joinCode={createdTeam.join_code}
          teamName={createdTeam.name}
          onClose={() => {
            const teamId = createdTeam.id;
            setCreatedTeam(null);
            navigate(`/teams/${teamId}`);
          }}
        />
      )}
      {createdTeam && !createdTeam.join_code && (
        <Alert tone="success" title="Team created">
          No join code was generated. Invite teammates by email from the team workspace.
          <div className="mt-2">
            <Link to={`/teams/${createdTeam.id}`}>
              <Button variant="outline" size="sm">
                Open team workspace
              </Button>
            </Link>
          </div>
        </Alert>
      )}
    </div>
  );
}
