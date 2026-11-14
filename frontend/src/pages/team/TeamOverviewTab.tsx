import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, LogOut, Mail, ShieldCheck, Trash2, UserMinus } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import {
  useDisbandTeam,
  useInviteToTeam,
  useLeaveTeam,
  useRemoveTeamMember,
  useTransferOwnership,
  useUpdateTeamMemberRole,
} from '@/hooks/useTeams';
import { canManageTeam, isTeamOwner } from '@/lib/permissions';
import { formatDate, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { TeamDetailRead, TeamMemberInfo, TeamMemberRead } from '@/api/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const inviteSchema = z.object({
  invitee_email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
});
type InviteForm = z.infer<typeof inviteSchema>;

export function TeamOverviewTab({
  team,
  membership,
}: {
  team: TeamDetailRead;
  membership: TeamMemberInfo | null;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const isOwner = isTeamOwner(membership);
  const canManage = canManageTeam(membership);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberInfo | null>(null);
  const [transferTarget, setTransferTarget] = useState<TeamMemberInfo | null>(null);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const invite = useInviteToTeam(team.id);
  const removeMember = useRemoveTeamMember(team.id);
  const updateRole = useUpdateTeamMemberRole(team.id);
  const transfer = useTransferOwnership(team.id);
  const disband = useDisbandTeam(team.id);
  const leave = useLeaveTeam(team.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteForm>({ resolver: zodResolver(inviteSchema), defaultValues: { invitee_email: '' } });

  const roster = team.members ?? [];
  const activeMembers = roster.filter((member) => member.status === 'active');
  const formerMembers = roster.filter((member) => member.status === 'left');

  const handleMutationError = (error: unknown) => toast.error(toApiError(error).message);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="space-y-4 lg:col-span-2">
        <CardHeader
          title="Roster"
          description="Only active members can see this roster."
          actions={
            canManage ? (
              <Button
                size="sm"
                variant="outline"
                icon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => setInviteOpen(true)}
              >
                Invite by email
              </Button>
            ) : undefined
          }
        />

        {activeMembers.length === 0 ? (
          <EmptyState
            inline
            icon={UserMinus}
            title="No active members"
            description="This team has no active members right now."
          />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {activeMembers.map((member) => (
              <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={member.display_name} username={member.username} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-xs font-bold text-ink">
                      {member.display_name}
                      {member.role === 'owner' && (
                        <Crown className="h-3 w-3 text-amber-600" aria-hidden="true" />
                      )}
                    </p>
                    <p className="truncate text-[11px] text-taupe">
                      @{member.username} · joined {formatDate(member.joined_at)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={member.role === 'owner' ? 'gold' : member.role === 'lead' ? 'metric' : 'neutral'}>
                    {humanizeEnum(member.role)}
                  </Badge>

                  {isOwner && member.role !== 'owner' && (
                    <>
                      <Select
                        aria-label={`Change role for ${member.display_name}`}
                        className="w-28"
                        value={member.role}
                        onChange={(event) =>
                          updateRole.mutate(
                            {
                              userId: member.user_id,
                              body: { role: event.target.value as 'lead' | 'member' },
                            },
                            {
                              onSuccess: () => toast.success(`${member.display_name} is now ${event.target.value}.`),
                              onError: handleMutationError,
                            },
                          )
                        }
                        options={[
                          { value: 'member', label: 'Member' },
                          { value: 'lead', label: 'Lead' },
                        ]}
                      />
                      <Button
                        variant="chip"
                        size="sm"
                        onClick={() => setTransferTarget(member)}
                        icon={<ShieldCheck className="h-3 w-3" aria-hidden="true" />}
                      >
                        Make owner
                      </Button>
                      <Button
                        variant="chip"
                        size="sm"
                        onClick={() => setRemoveTarget(member)}
                        icon={<UserMinus className="h-3 w-3" aria-hidden="true" />}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {formerMembers.length > 0 && (
          <div className="border-t border-line-subtle pt-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Former members</p>
            <ul className="mt-1 space-y-1">
              {formerMembers.map((member) => (
                <li key={member.user_id} className="text-[11px] text-muted">
                  {member.display_name} (@{member.username}) · left {formatDate(member.left_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3">
          <CardHeader title="Team facts" />
          <dl className="space-y-2 pt-2">
            <Fact label="Status" value={<StatusBadge status={team.status} />} />
            <Fact label="Created" value={formatDate(team.created_at)} mono />
            <Fact label="Capacity" value={`${team.member_count} / ${team.max_team_size}`} mono />
            <Fact label="Open slots" value={String(team.available_slots)} mono />
            <Fact label="Your role" value={membership ? humanizeEnum(membership.role) : 'Not a member'} />
          </dl>
        </Card>

        {membership && (
          <Card className="space-y-2">
            <CardHeader title="Membership" />
            {isOwner ? (
              <>
                <p className="pt-2 text-[11px] leading-relaxed text-taupe">
                  Owners cannot leave without transferring ownership first.
                </p>
                <Button
                  variant="danger"
                  block
                  icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => setDisbandOpen(true)}
                >
                  Disband team
                </Button>
              </>
            ) : (
              <>
                <p className="pt-2 text-[11px] leading-relaxed text-taupe">
                  Leaving frees your slot; you can rejoin later with a valid join code.
                </p>
                <Button
                  variant="outline"
                  block
                  icon={<LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => setLeaveOpen(true)}
                >
                  Leave team
                </Button>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Invite by email */}
      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          invite.reset();
          reset();
        }}
        title="Invite a teammate"
        description="The person must already be registered for this event."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={invite.isPending}
              onClick={handleSubmit((values) =>
                invite.mutate(
                  { invitee_email: values.invitee_email.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Invitation sent. It expires in 7 days.');
                      setInviteOpen(false);
                      reset();
                    },
                    onError: handleMutationError,
                  },
                ),
              )}
            >
              Send invitation
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) =>
            invite.mutate(
              { invitee_email: values.invitee_email.trim() },
              {
                onSuccess: () => {
                  toast.success('Invitation sent. It expires in 7 days.');
                  setInviteOpen(false);
                  reset();
                },
                onError: handleMutationError,
              },
            ),
          )}
        >
          {invite.isError && (
            <Alert tone="error" title="Could not send the invitation">
              {toApiError(invite.error).message}
            </Alert>
          )}
          <Field label="Email address" htmlFor="invite-email" error={errors.invitee_email?.message} required>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@example.com"
              invalid={Boolean(errors.invitee_email)}
              {...register('invitee_email')}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          removeMember.mutate(removeTarget.user_id, {
            onSuccess: () => {
              toast.success(`${removeTarget.display_name} was removed from the team.`);
              setRemoveTarget(null);
            },
            onError: (error) => {
              setRemoveTarget(null);
              handleMutationError(error);
            },
          });
        }}
        title="Remove this member?"
        description="They lose access to the board, chat, files and project immediately."
        confirmLabel="Remove member"
        destructive
        loading={removeMember.isPending}
      >
        <p>
          {removeTarget?.display_name} (@{removeTarget?.username}) will be set to <em>left</em>. Their
          existing messages and task assignments stay in the history.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(transferTarget)}
        onClose={() => setTransferTarget(null)}
        onConfirm={() => {
          if (!transferTarget) return;
          transfer.mutate(
            { new_owner_user_id: transferTarget.user_id },
            {
              onSuccess: (member: TeamMemberRead) => {
                toast.success(`${transferTarget.display_name} is now the team owner.`);
                setTransferTarget(null);
                if (member.role !== 'owner') {
                  toast.info('Ownership transfer completed.');
                }
              },
              onError: (error) => {
                setTransferTarget(null);
                handleMutationError(error);
              },
            },
          );
        }}
        title="Transfer ownership?"
        description="Exactly one owner is maintained at all times."
        confirmLabel="Transfer ownership"
        loading={transfer.isPending}
      >
        <p>
          You become a regular member and {transferTarget?.display_name} becomes the owner. Only the
          owner can disband the team or manage member roles.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={disbandOpen}
        onClose={() => setDisbandOpen(false)}
        onConfirm={() =>
          disband.mutate(undefined, {
            onSuccess: () => {
              toast.success('Team disbanded.');
              navigate(`/events/${team.event_id}/teams`);
            },
            onError: (error) => {
              setDisbandOpen(false);
              handleMutationError(error);
            },
          })
        }
        title="Disband this team?"
        description="This cannot be undone."
        confirmLabel="Disband team"
        destructive
        loading={disband.isPending}
      >
        <p>
          Every active membership is marked as left, pending invitations are cancelled, and the team
          stops appearing in discovery. Submitted projects remain on the event's record.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() =>
          leave.mutate(undefined, {
            onSuccess: () => {
              toast.success('You left the team.');
              navigate(`/events/${team.event_id}/teams`);
            },
            onError: (error) => {
              setLeaveOpen(false);
              handleMutationError(error);
            },
          })
        }
        title="Leave this team?"
        confirmLabel="Leave team"
        destructive
        loading={leave.isPending}
      >
        <p>Your slot is released immediately and you lose access to the team workspace.</p>
      </ConfirmDialog>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={mono ? 'font-mono text-xs text-ink' : 'text-xs font-medium text-ink'}>{value}</dd>
    </div>
  );
}
