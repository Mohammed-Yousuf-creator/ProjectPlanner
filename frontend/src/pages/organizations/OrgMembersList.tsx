import { useState } from 'react';
import { Mail, Trash2, Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';
import {
  useInviteOrganizationMember,
  useOrganizationMembers,
  useRemoveOrganizationMember,
} from '@/hooks/useOrganizations';
import { canManageOrganization, isOrganizationOwner } from '@/lib/permissions';
import { formatDate, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { OrganizationMemberDetailRead } from '@/api/types';

export function OrgMembersList({ orgId, myRole }: { orgId: string; myRole: string | null }) {
  const toast = useToast();
  const canManage = canManageOrganization(myRole);
  const isOwner = isOrganizationOwner(myRole);

  const members = useOrganizationMembers(orgId);
  const invite = useInviteOrganizationMember(orgId);
  const remove = useRemoveOrganizationMember(orgId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [removeTarget, setRemoveTarget] = useState<OrganizationMemberDetailRead | null>(null);

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Members"
        description="Only active members are listed. Invitations can target any registered email."
        actions={
          canManage ? (
            <Button
              size="sm"
              variant="outline"
              icon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => setInviteOpen(true)}
            >
              Invite
            </Button>
          ) : undefined
        }
      />

      {members.isLoading ? (
        <SkeletonTable rows={4} />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : !members.data || members.data.length === 0 ? (
        <EmptyState inline icon={Users} title="No members" description="This organization has no active members." />
      ) : (
        <ul className="divide-y divide-line-subtle">
          {members.data.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={member.display_name} username={member.username} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-ink">{member.display_name}</p>
                  <p className="truncate text-[11px] text-taupe">
                    @{member.username} · {member.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={member.role === 'owner' ? 'gold' : member.role === 'admin' ? 'metric' : 'neutral'}>
                  {humanizeEnum(member.role)}
                </Badge>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Joined {formatDate(member.joined_at)}
                </span>
                {isOwner && member.role !== 'owner' && (
                  <Button
                    variant="chip"
                    size="sm"
                    icon={<Trash2 className="h-3 w-3" aria-hidden="true" />}
                    onClick={() => setRemoveTarget(member)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted">
        Admins cannot remove owners, and the last remaining owner cannot be removed — the server
        enforces both rules.
      </p>

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          invite.reset();
        }}
        title="Invite a member"
        description="The person must already have an account on the platform."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={invite.isPending}
              onClick={() => {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  toast.error('Enter a valid email address.');
                  return;
                }
                invite.mutate(
                  { email: email.trim(), role },
                  {
                    onSuccess: () => {
                      toast.success('Invitation created.');
                      setInviteOpen(false);
                      setEmail('');
                      setRole('member');
                    },
                    onError: (error) => toast.error(toApiError(error).message),
                  },
                );
              }}
            >
              Send invitation
            </Button>
          </>
        }
      >
        {invite.isError && (
          <Alert tone="error" title="Could not invite the member">
            {toApiError(invite.error).message}
          </Alert>
        )}
        <Field label="Email address" htmlFor="org-invite-email" required>
          <Input
            id="org-invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
          />
        </Field>
        <Field label="Role" htmlFor="org-invite-role">
          <Select
            id="org-invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as 'admin' | 'member')}
            options={[
              { value: 'member', label: 'Member' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          remove.mutate(removeTarget.user_id, {
            onSuccess: () => {
              toast.success('Member removed.');
              setRemoveTarget(null);
            },
            onError: (error) => {
              setRemoveTarget(null);
              toast.error(toApiError(error).message);
            },
          });
        }}
        title="Remove this member?"
        confirmLabel="Remove member"
        destructive
        loading={remove.isPending}
      >
        <p>
          {removeTarget?.display_name} loses access to this organization's events and sponsorship
          data immediately.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
