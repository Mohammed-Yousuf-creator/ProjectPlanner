import { Link } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useMyOrganizations, useRespondToOrganizationInvitation } from '@/hooks/useOrganizations';
import { formatDate, humanizeEnum, isSafeHttpUrl } from '@/lib/format';
import { toApiError } from '@/lib/errors';

/**
 * `GET /organizations/mine` includes pending invitations (`my_status = invited`),
 * which we surface with accept/reject actions.
 */
export function OrganizationsPage() {
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useMyOrganizations();
  const respond = useRespondToOrganizationInvitation();

  const invitations = (data ?? []).filter((org) => org.my_status === 'invited');
  const active = (data ?? []).filter((org) => org.my_status !== 'invited');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizer"
        title="Organizations"
        description="Organizations own events and sponsorship listings. Members manage them by role."
        actions={
          <Link to="/organizations/new">
            <Button icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>New organization</Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="You don't belong to an organization yet"
          description="Create one to publish events, manage participants, and open sponsorship listings."
          actions={
            <Link to="/organizations/new">
              <Button>Create an organization</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {invitations.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-mono text-[11px] uppercase tracking-wider text-rust">
                Pending invitations
              </h2>
              {invitations.map((org) => (
                <Card key={org.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-ink">{org.name}</p>
                    <p className="text-[11px] text-taupe">
                      Invited as {humanizeEnum(org.my_role)} · {humanizeEnum(org.organization_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      loading={respond.isPending}
                      onClick={() =>
                        respond.mutate(
                          { orgId: org.id, membershipId: org.id, action: 'accept' },
                          {
                            onSuccess: () => toast.success(`Joined ${org.name}.`),
                            onError: (mutationError) =>
                              toast.error(toApiError(mutationError).message),
                          },
                        )
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={respond.isPending}
                      onClick={() =>
                        respond.mutate(
                          { orgId: org.id, membershipId: org.id, action: 'reject' },
                          {
                            onSuccess: () => toast.info('Invitation rejected.'),
                            onError: (mutationError) =>
                              toast.error(toApiError(mutationError).message),
                          },
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              ))}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-taupe">
              Your organizations
            </h2>
            {active.length === 0 ? (
              <EmptyState
                inline
                icon={Building2}
                title="No active memberships"
                description="Accept an invitation above, or create your own organization."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {active.map((org) => (
                  <Link key={org.id} to={`/organizations/${org.id}`}>
                    <Card interactive className="h-full space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="category">{humanizeEnum(org.organization_type)}</Badge>
                        <Badge variant={org.my_role === 'owner' ? 'gold' : 'metric'}>
                          {humanizeEnum(org.my_role)}
                        </Badge>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-ink transition-colors group-hover:text-rust">
                          {org.name}
                        </h3>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                          /{org.slug}
                        </p>
                      </div>
                      {org.description && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-taupe">
                          {org.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between border-t border-line-subtle pt-3 text-[11px] text-taupe">
                        <span>Joined {formatDate(org.my_joined_at)}</span>
                        {isSafeHttpUrl(org.website_url) && <span>Website</span>}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
