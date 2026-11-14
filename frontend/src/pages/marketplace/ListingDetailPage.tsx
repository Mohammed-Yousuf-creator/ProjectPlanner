import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarRange,
  Coins,
  Package as PackageIcon,
  Plus,
  Send,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  useCreatePackage,
  useDeletePackage,
  useSponsorshipListing,
  useSponsorshipListingAction,
  useSponsorshipPackages,
  useUpdatePackage,
} from '@/hooks/useSponsorship';
import { useMyOrganizations } from '@/hooks/useOrganizations';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, humanizeEnum } from '@/lib/format';
import { canManageOrganization, findMyOrganizationRole } from '@/lib/permissions';
import { toApiError } from '@/lib/errors';
import type { SponsorshipPackageRead } from '@/api/types';
import { ProposalModal } from './ProposalModal';
import { PackageCard } from './PackageCard';

const TYPE_LABEL: Record<string, string> = {
  seeking_sponsors: 'Seeking sponsors',
  offering_sponsorship: 'Offering sponsorship',
};

/**
 * Listing detail. The owner organization's managers additionally get the
 * publish/close controls, package CRUD, and a link to incoming proposals.
 */
export function ListingDetailPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const toast = useToast();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));

  const listingQuery = useSponsorshipListing(listingId);
  const packages = useSponsorshipPackages(listingId);
  const mine = useMyOrganizations();

  const listing = listingQuery.data;
  const orgId = listing?.owner_organization_id ?? '';
  const myRole = findMyOrganizationRole(mine.data, orgId || undefined);
  const canManage = Boolean(orgId) && canManageOrganization(myRole);

  const action = useSponsorshipListingAction(orgId);
  const createPackage = useCreatePackage(orgId);
  const updatePackage = useUpdatePackage(orgId);
  const deletePackage = useDeletePackage(orgId);

  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SponsorshipPackageRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SponsorshipPackageRead | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'publish' | 'close' | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    currency: 'INR',
    benefits: '',
    available_slots: '1',
  });

  const openPackageCreate = () => {
    setEditingPackage(null);
    setForm({ name: '', description: '', price: '', currency: 'INR', benefits: '', available_slots: '1' });
    setPackageModalOpen(true);
  };

  const openPackageEdit = (pkg: SponsorshipPackageRead) => {
    setEditingPackage(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? '',
      price: pkg.price ?? '',
      currency: pkg.currency,
      benefits: Array.isArray(pkg.benefits) ? (pkg.benefits as string[]).join('\n') : '',
      available_slots: String(pkg.available_slots ?? 1),
    });
    setPackageModalOpen(true);
  };

  const savePackage = () => {
    if (!form.name.trim()) {
      toast.error('A package name is required.');
      return;
    }
    const benefits = form.benefits
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const base = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      currency: form.currency.trim() || 'INR',
      benefits,
      available_slots: Number(form.available_slots) > 0 ? Number(form.available_slots) : 1,
    };

    if (editingPackage) {
      updatePackage.mutate(
        {
          packageId: editingPackage.id,
          body: { ...base, price: form.price.trim() || null },
          listingId: listingId ?? '',
        },
        {
          onSuccess: () => {
            toast.success('Package updated.');
            setPackageModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    } else {
      createPackage.mutate(
        { listingId: listingId ?? '', body: { ...base, price: form.price.trim() || '0' } },
        {
          onSuccess: () => {
            toast.success('Package created.');
            setPackageModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    }
  };

  if (listingQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-sm" />
        <Card>
          <SkeletonLines lines={6} />
        </Card>
      </div>
    );
  }

  if (listingQuery.isError) {
    const apiError = toApiError(listingQuery.error);
    if (apiError.status === 404) {
      return (
        <EmptyState
          icon={PackageIcon}
          title="Listing not found"
          description="It may have been closed or removed."
          actions={
            <Link to="/marketplace">
              <Button variant="outline">Back to marketplace</Button>
            </Link>
          }
        />
      );
    }
    return <ErrorState error={listingQuery.error} onRetry={() => void listingQuery.refetch()} />;
  }

  if (!listing) return null;

  const isSeeking = listing.listing_type === 'seeking_sponsors';
  // The backend lets the *non-owner* side propose against a listing, so the CTA is
  // hidden only for the owner organization.
  const canPropose =
    listing.status === 'active' && isAuthenticated && Boolean(mine.data) && !canManage;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sponsorship listing"
        title={listing.title}
        description={listing.audience_description ?? undefined}
        breadcrumbs={[
          { label: 'Marketplace', to: '/marketplace' },
          { label: listing.title },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={listing.status} />
            <Badge variant={isSeeking ? 'category' : 'metric'}>
              {TYPE_LABEL[listing.listing_type] ?? humanizeEnum(listing.listing_type)}
            </Badge>
          </div>
        }
      />

      {canManage && (
        <Alert tone="info" title="You manage this listing">
          Publishing makes it discoverable in the marketplace. Closing permanently stops new
          proposals.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="About this listing" />
            <p className="whitespace-pre-line pt-3 text-xs leading-relaxed text-taupe">
              {listing.description}
            </p>
            {Array.isArray(listing.benefits) && listing.benefits.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-line-subtle pt-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Benefits</p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-taupe">
                  {(listing.benefits as string[]).map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <CardHeader
              title="Packages"
              description="Tiers the other side can reference when proposing."
              actions={
                canManage ? (
                  <Button
                    size="sm"
                    onClick={openPackageCreate}
                    icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    Add package
                  </Button>
                ) : undefined
              }
            />

            {packages.isLoading ? (
              <SkeletonLines lines={3} />
            ) : packages.isError ? (
              <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />
            ) : !packages.data || packages.data.length === 0 ? (
              <EmptyState
                inline
                icon={PackageIcon}
                title="No packages"
                description={
                  canManage
                    ? 'Add tiers so sponsors can pick a concrete offer.'
                    : 'The owner has not published package tiers for this listing.'
                }
                actions={
                  canManage ? <Button onClick={openPackageCreate}>Add the first package</Button> : undefined
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {packages.data.map((pkg) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    manage={canManage}
                    onEdit={() => openPackageEdit(pkg)}
                    onDelete={() => setDeleteTarget(pkg)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2.5 pt-3 text-[11px]">
              <Row icon={<Building2 className="h-3 w-3" aria-hidden="true" />} label="Owner">
                {listing.owner_organization_name ?? 'Organization'}
              </Row>
              {(listing.event_name || listing.event_title) && (
                <Row icon={<CalendarRange className="h-3 w-3" aria-hidden="true" />} label="Event">
                  {listing.event_name ?? listing.event_title}
                </Row>
              )}
              <Row icon={<Coins className="h-3 w-3" aria-hidden="true" />} label="Budget">
                {listing.min_budget || listing.max_budget
                  ? `${listing.currency} ${listing.min_budget ?? '0'} – ${listing.max_budget ?? 'open'}`
                  : 'Negotiable'}
              </Row>
              <Row icon={<CalendarRange className="h-3 w-3" aria-hidden="true" />} label="Expires">
                {listing.expires_at ? formatDate(listing.expires_at) : 'No expiry'}
              </Row>
            </dl>
          </Card>

          <Card className="space-y-3">
            <CardHeader title="Actions" />
            {canManage ? (
              <div className="space-y-2 pt-2">
                {listing.status === 'draft' && (
                  <Button block onClick={() => setConfirmAction('publish')}>
                    Publish listing
                  </Button>
                )}
                {listing.status !== 'closed' && (
                  <Button variant="outline" block onClick={() => setConfirmAction('close')}>
                    Close listing
                  </Button>
                )}
                <Link to={`/organizations/${listing.owner_organization_id}/sponsorship`}>
                  <Button variant="chip" block>
                    Manage proposals & deals
                  </Button>
                </Link>
              </div>
            ) : canPropose ? (
              <div className="space-y-2 pt-2">
                <Button block onClick={() => setProposalOpen(true)} icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}>
                  Send a proposal
                </Button>
                <p className="text-[11px] text-muted">
                  Proposals are sent from one of your organizations and target a specific event.
                </p>
              </div>
            ) : !isAuthenticated ? (
              <div className="space-y-2 pt-2">
                <Link to={`/login?next=/marketplace/${listing.id}`}>
                  <Button block>Sign in to propose</Button>
                </Link>
              </div>
            ) : (
              <p className="pt-2 text-[11px] text-muted">
                This listing is not accepting proposals. Status is {humanizeEnum(listing.status)}.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Link to="/marketplace" className="inline-flex items-center gap-1 text-[11px] font-semibold text-taupe hover:text-ink">
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back to all listings
      </Link>

      <Modal
        open={packageModalOpen}
        onClose={() => setPackageModalOpen(false)}
        title={editingPackage ? 'Edit package' : 'New package'}
        description="Benefits are one per line."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPackageModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePackage} loading={createPackage.isPending || updatePackage.isPending}>
              {editingPackage ? 'Save changes' : 'Create package'}
            </Button>
          </>
        }
      >
        {(createPackage.isError || updatePackage.isError) && (
          <Alert tone="error" title="Could not save the package">
            {toApiError(createPackage.error ?? updatePackage.error).message}
          </Alert>
        )}
        <Field label="Name" htmlFor="package-name" required>
          <Input
            id="package-name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Platinum"
          />
        </Field>
        <Field label="Description" htmlFor="package-description">
          <Textarea
            id="package-description"
            rows={2}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price" htmlFor="package-price">
            <Input
              id="package-price"
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              placeholder="50000.00"
            />
          </Field>
          <Field label="Currency" htmlFor="package-currency">
            <Input
              id="package-currency"
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
            />
          </Field>
          <Field label="Available slots" htmlFor="package-slots">
            <Input
              id="package-slots"
              type="number"
              min={1}
              value={form.available_slots}
              onChange={(event) => setForm((prev) => ({ ...prev, available_slots: event.target.value }))}
            />
          </Field>
        </div>
        <Field label="Benefits" htmlFor="package-benefits" hint="One benefit per line.">
          <Textarea
            id="package-benefits"
            rows={4}
            value={form.benefits}
            onChange={(event) => setForm((prev) => ({ ...prev, benefits: event.target.value }))}
            placeholder={'Logo on the event page\nBooth in the venue'}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deletePackage.mutate(
            { packageId: deleteTarget.id, listingId: listingId ?? '' },
            {
              onSuccess: () => {
                toast.success('Package deleted.');
                setDeleteTarget(null);
              },
              onError: (error) => {
                setDeleteTarget(null);
                toast.error(toApiError(error).message);
              },
            },
          );
        }}
        title="Delete this package?"
        confirmLabel="Delete package"
        destructive
        loading={deletePackage.isPending}
      >
        <p>“{deleteTarget?.name}” disappears from the listing. Proposals that referenced it keep their recorded name.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          action.mutate(
            { listingId: listing.id, action: confirmAction },
            {
              onSuccess: () => {
                toast.success(confirmAction === 'publish' ? 'Listing published.' : 'Listing closed.');
                setConfirmAction(null);
              },
              onError: (error) => {
                setConfirmAction(null);
                toast.error(toApiError(error).message);
              },
            },
          );
        }}
        title={confirmAction === 'publish' ? 'Publish this listing?' : 'Close this listing?'}
        description={
          confirmAction === 'publish'
            ? 'It becomes visible in the marketplace immediately.'
            : 'Closing stops new proposals permanently.'
        }
        confirmLabel={confirmAction === 'publish' ? 'Publish' : 'Close listing'}
        destructive={confirmAction === 'close'}
        loading={action.isPending}
      >
        <p>Status changes are recorded on the listing and shown to everyone who views it.</p>
      </ConfirmDialog>

      {listing && (
        <ProposalModal
          open={proposalOpen}
          onClose={() => setProposalOpen(false)}
          listing={listing}
          packages={packages.data ?? []}
        />
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-muted">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </dt>
      <dd className="max-w-[55%] text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}
