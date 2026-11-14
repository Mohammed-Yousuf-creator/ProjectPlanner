import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useMyTeamInvitations } from '@/hooks/useParticipant';
import { useRespondToTeamInvitations } from '@/hooks/useTeamInvitationActions';
import { formatDateTime, formatRelative } from '@/lib/format';
import { toApiError } from '@/lib/errors';

/** Inbox for pending (non-expired) team invitations. */
export function TeamInvitationsPage() {
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useMyTeamInvitations();
  const respond = useRespondToTeamInvitations();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teams"
        title="Team invitations"
        description="Pending invitations only. Each invitation expires 7 days after it was sent."
      />

      {isLoading ? (
        <Card>
          <SkeletonLines lines={6} />
        </Card>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No pending invitations"
          description="When a team owner or lead invites your email you will see it here, and in your notifications."
        />
      ) : (
        <div className="space-y-3">
          {data.map((invitation) => (
            <Card key={invitation.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-ink">{invitation.team_name}</p>
                  <p className="text-[11px] text-taupe">
                    {invitation.event_name} · invited by {invitation.inviter.display_name}
                    {invitation.inviter.username ? ` (@${invitation.inviter.username})` : ''}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    Expires {formatRelative(invitation.expires_at)} (
                    {formatDateTime(invitation.expires_at)})
                  </p>
                </div>
                <Avatar
                  name={invitation.inviter.display_name}
                  username={invitation.inviter.username}
                  src={invitation.inviter.avatar_url}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
                <Button
                  loading={respond.isPending}
                  onClick={() =>
                    respond.mutate(
                      { invitationId: invitation.id, action: 'accept' },
                      {
                        onSuccess: () => toast.success(`You joined ${invitation.team_name}.`),
                        onError: (mutationError) =>
                          toast.error(toApiError(mutationError).message),
                      },
                    )
                  }
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  disabled={respond.isPending}
                  onClick={() =>
                    respond.mutate(
                      { invitationId: invitation.id, action: 'reject' },
                      {
                        onSuccess: () => toast.info('Invitation declined.'),
                        onError: (mutationError) =>
                          toast.error(toApiError(mutationError).message),
                      },
                    )
                  }
                >
                  Decline
                </Button>
                <Link
                  to={`/events/${invitation.event_id}/teams`}
                  className="text-[11px] font-semibold text-rust hover:underline"
                >
                  See other teams in this event
                </Link>
              </div>
            </Card>
          ))}
          <Alert tone="info">
            Accepting checks the team capacity and your other memberships again — a full team or a
            conflicting membership is rejected by the server.
          </Alert>
        </div>
      )}
    </div>
  );
}
