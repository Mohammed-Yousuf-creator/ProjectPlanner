import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, ExternalLink, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { OrganizationSidebar } from '@/components/domain/OrganizationSidebar';
import {
  useMyOrganizations,
  useOrganization,
  useUpdateOrganization,
} from '@/hooks/useOrganizations';
import { canManageOrganization, findMyOrganizationRole } from '@/lib/permissions';
import { formatDate, humanizeEnum, isSafeHttpUrl } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import { ORGANIZATION_TYPES } from '@/lib/constants';
import { OrgEventsList } from './OrgEventsList';
import { OrgMembersList } from './OrgMembersList';

export function OrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const org = useOrganization(orgId);
  const mine = useMyOrganizations();
  const updateOrg = useUpdateOrganization(orgId ?? '');

  const myRole = findMyOrganizationRole(mine.data, orgId);
  const canManage = canManageOrganization(myRole);

  const [form, setForm] = useState({
    name: '',
    description: '',
    website_url: '',
    contact_email: '',
    organization_type: 'organizer',
  });

  // Sync the edit form once the organization resolves, and again only when the
  // server data actually changes. Keying on `org.data` (an object) meant every
  // background refetch — even one returning identical data — reset the fields
  // while the user was mid-edit. `dataUpdatedAt` only advances on a real fetch
  // result; combined with the field values it is a stable, content-based key.
  const orgSnapshot = org.data
    ? `${org.data.name}|${org.data.description ?? ''}|${org.data.website_url ?? ''}|${org.data.contact_email ?? ''}|${org.data.organization_type}`
    : null;
  useEffect(() => {
    if (!org.data) return;
    setForm({
      name: org.data.name,
      description: org.data.description ?? '',
      website_url: org.data.website_url ?? '',
      contact_email: org.data.contact_email ?? '',
      organization_type: org.data.organization_type,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSnapshot]);

  if (org.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-md" />
        <Card>
          <SkeletonLines lines={6} />
        </Card>
      </div>
    );
  }

  if (org.isError) {
    const apiError = toApiError(org.error);
    if (apiError.status === 403 || apiError.status === 404) {
      return (
        <EmptyState
          icon={Building2}
          title="Organization not available"
          description={apiError.message}
          actions={
            <Button variant="outline" onClick={() => history.back()}>
              Go back
            </Button>
          }
        />
      );
    }
    return <ErrorState error={org.error} onRetry={() => void org.refetch()} />;
  }

  const organization = org.data;
  if (!organization) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={humanizeEnum(organization.organization_type)}
        title={organization.name}
        description={organization.description ?? 'No organization description yet.'}
        breadcrumbs={[{ label: 'Organizations', to: '/organizations' }, { label: organization.name }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">/{organization.slug}</Badge>
            {myRole && (
              <Badge variant={myRole === 'owner' ? 'gold' : 'metric'}>{humanizeEnum(myRole)}</Badge>
            )}
            {isSafeHttpUrl(organization.website_url) && (
              <a href={organization.website_url ?? undefined} target="_blank" rel="noopener noreferrer">
                <Button variant="chip" size="sm" icon={<ExternalLink className="h-3 w-3" aria-hidden="true" />}>
                  Website
                </Button>
              </a>
            )}
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <OrganizationSidebar orgId={organization.id} />

        <div className="min-w-0 flex-1 space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid gap-3 pt-3 sm:grid-cols-2">
              <Detail label="Type" value={humanizeEnum(organization.organization_type)} />
              <Detail label="Contact" value={organization.contact_email ?? 'Not provided'} />
              <Detail label="Created" value={formatDate(organization.created_at)} mono />
              <Detail label="Status" value={humanizeEnum(organization.status)} />
            </dl>
          </Card>

          <OrgEventsList orgId={organization.id} myRole={myRole} />
          <OrgMembersList orgId={organization.id} myRole={myRole} />
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit organization"
        description="Only owners and admins can change these details."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={updateOrg.isPending}
              onClick={() =>
                updateOrg.mutate(
                  {
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    website_url: form.website_url.trim() || null,
                    contact_email: form.contact_email.trim() || null,
                    organization_type: form.organization_type as
                      | 'organizer'
                      | 'sponsor'
                      | 'both'
                      | 'other',
                  },
                  {
                    onSuccess: () => {
                      toast.success('Organization updated.');
                      setEditOpen(false);
                    },
                    onError: (error) => toast.error(toApiError(error).message),
                  },
                )
              }
            >
              Save changes
            </Button>
          </>
        }
      >
        {updateOrg.isError && (
          <Alert tone="error" title="Could not save">
            {toApiError(updateOrg.error).message}
          </Alert>
        )}
        <Field label="Name" htmlFor="edit-org-name" required>
          <Input
            id="edit-org-name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </Field>
        <Field label="Type" htmlFor="edit-org-type">
          <Select
            id="edit-org-type"
            value={form.organization_type}
            onChange={(event) => setForm((prev) => ({ ...prev, organization_type: event.target.value }))}
            options={ORGANIZATION_TYPES.map((type) => ({ value: type.value, label: type.label }))}
          />
        </Field>
        <Field label="Description" htmlFor="edit-org-description">
          <Textarea
            id="edit-org-description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Website" htmlFor="edit-org-website">
            <Input
              id="edit-org-website"
              value={form.website_url}
              onChange={(event) => setForm((prev) => ({ ...prev, website_url: event.target.value }))}
            />
          </Field>
          <Field label="Contact email" htmlFor="edit-org-email">
            <Input
              id="edit-org-email"
              type="email"
              value={form.contact_email}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))}
            />
          </Field>
        </div>
      </Modal>
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
