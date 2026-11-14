import { useState } from 'react';
import { Globe2, HandCoins, Pencil, Plus, XCircle } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  useCreateSponsorshipListing,
  useOrgSponsorshipListings,
  useSponsorshipListingAction,
  useUpdateSponsorshipListing,
} from '@/hooks/useSponsorship';
import { useOrganizationEvents } from '@/hooks/useOrganizations';
import { LISTING_TYPES } from '@/lib/constants';
import { formatDate, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { SponsorshipListingRead } from '@/api/types';

/**
 * Listings owned by the organization.
 * `SponsorshipListingCreate` requires type, title and description; `event_id` is
 * optional but must be one of this organization's events when supplied.
 */
export function OrgSponsorshipListingsTab({ orgId }: { orgId: string }) {
  const toast = useToast();
  const listings = useOrgSponsorshipListings(orgId);
  const events = useOrganizationEvents(orgId);
  const createListing = useCreateSponsorshipListing(orgId);
  const updateListing = useUpdateSponsorshipListing(orgId);
  const action = useSponsorshipListingAction(orgId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorshipListingRead | null>(null);
  const [closeTarget, setCloseTarget] = useState<SponsorshipListingRead | null>(null);
  const [form, setForm] = useState({
    listing_type: 'seeking_sponsors',
    title: '',
    description: '',
    audience_description: '',
    event_id: '',
    min_budget: '',
    max_budget: '',
    currency: 'INR',
    benefits: '',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      listing_type: 'seeking_sponsors',
      title: '',
      description: '',
      audience_description: '',
      event_id: '',
      min_budget: '',
      max_budget: '',
      currency: 'INR',
      benefits: '',
    });
    setModalOpen(true);
  };

  const openEdit = (listing: SponsorshipListingRead) => {
    setEditing(listing);
    setForm({
      listing_type: listing.listing_type,
      title: listing.title,
      description: listing.description,
      audience_description: listing.audience_description ?? '',
      event_id: listing.event_id ?? '',
      min_budget: listing.min_budget ?? '',
      max_budget: listing.max_budget ?? '',
      currency: listing.currency,
      benefits: Array.isArray(listing.benefits) ? (listing.benefits as string[]).join('\n') : '',
    });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Title and description are both required.');
      return;
    }
    if (form.min_budget && form.max_budget && Number(form.min_budget) > Number(form.max_budget)) {
      toast.error('The minimum budget cannot exceed the maximum.');
      return;
    }

    const benefits = form.benefits
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (editing) {
      updateListing.mutate(
        {
          listingId: editing.id,
          body: {
            event_id: form.event_id || null,
            title: form.title.trim(),
            description: form.description.trim(),
            audience_description: form.audience_description.trim() || null,
            min_budget: form.min_budget.trim() || null,
            max_budget: form.max_budget.trim() || null,
            currency: form.currency.trim() || 'INR',
            benefits,
          },
        },
        {
          onSuccess: () => {
            toast.success('Listing updated.');
            setModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    } else {
      createListing.mutate(
        {
          listing_type: form.listing_type,
          title: form.title.trim(),
          description: form.description.trim(),
          audience_description: form.audience_description.trim() || null,
          event_id: form.event_id || null,
          min_budget: form.min_budget.trim() || null,
          max_budget: form.max_budget.trim() || null,
          currency: form.currency.trim() || 'INR',
          benefits,
        },
        {
          onSuccess: () => {
            toast.success('Listing created as a draft.');
            setModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    }
  };

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Sponsorship listings"
        description="New listings start as drafts and are invisible until published."
        actions={
          <Button size="sm" onClick={openCreate} icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
            New listing
          </Button>
        }
      />

      {listings.isLoading ? (
        <SkeletonLines lines={5} />
      ) : listings.isError ? (
        <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
      ) : !listings.data || listings.data.length === 0 ? (
        <EmptyState
          inline
          icon={HandCoins}
          title="No listings yet"
          description="Create a listing to attract sponsors, or to offer sponsorship to organizers."
          actions={<Button onClick={openCreate}>Create the first listing</Button>}
        />
      ) : (
        <ul className="divide-y divide-line-subtle">
          {listings.data.map((listing) => (
            <li key={listing.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold text-ink">{listing.title}</p>
                  <StatusBadge status={listing.status} />
                  <Badge variant={listing.listing_type === 'seeking_sponsors' ? 'category' : 'metric'}>
                    {humanizeEnum(listing.listing_type)}
                  </Badge>
                  <Badge variant="neutral">{listing.packages.length} packages</Badge>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-taupe">{listing.description}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                  {listing.event_name ?? 'No event linked'} · {humanizeEnum(listing.currency)}{' '}
                  {listing.min_budget ?? '0'}–{listing.max_budget ?? 'open'} ·{' '}
                  {listing.expires_at ? `expires ${formatDate(listing.expires_at)}` : 'no expiry'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="chip"
                  size="sm"
                  icon={<Pencil className="h-3 w-3" aria-hidden="true" />}
                  onClick={() => openEdit(listing)}
                >
                  Edit
                </Button>
                {listing.status === 'draft' && (
                  <Button
                    size="sm"
                    icon={<Globe2 className="h-3 w-3" aria-hidden="true" />}
                    onClick={() =>
                      action.mutate(
                        { listingId: listing.id, action: 'publish' },
                        {
                          onSuccess: () => toast.success('Listing published.'),
                          onError: (error) => toast.error(toApiError(error).message),
                        },
                      )
                    }
                  >
                    Publish
                  </Button>
                )}
                {listing.status !== 'closed' && (
                  <Button
                    variant="chip"
                    size="sm"
                    icon={<XCircle className="h-3 w-3" aria-hidden="true" />}
                    onClick={() => setCloseTarget(listing)}
                  >
                    Close
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit listing' : 'New sponsorship listing'}
        description="Publish separately — creating a listing keeps it as a draft."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={createListing.isPending || updateListing.isPending}>
              {editing ? 'Save changes' : 'Create draft'}
            </Button>
          </>
        }
      >
        {(createListing.isError || updateListing.isError) && (
          <Alert tone="error" title="Could not save the listing">
            {toApiError(createListing.error ?? updateListing.error).message}
          </Alert>
        )}
        {!editing && (
          <Field label="Listing type" htmlFor="listing-type" required>
            <Select
              id="listing-type"
              value={form.listing_type}
              onChange={(event) => setForm((prev) => ({ ...prev, listing_type: event.target.value }))}
              options={LISTING_TYPES.map((type) => ({ value: type.value, label: type.label }))}
            />
          </Field>
        )}
        <Field label="Title" htmlFor="listing-title" required>
          <Input
            id="listing-title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title sponsor for Winter Build Sprint"
          />
        </Field>
        <Field label="Description" htmlFor="listing-description" required>
          <Textarea
            id="listing-description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </Field>
        <Field label="Audience" htmlFor="listing-audience" hint="Who the sponsorship reaches.">
          <Textarea
            id="listing-audience"
            rows={2}
            value={form.audience_description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, audience_description: event.target.value }))
            }
          />
        </Field>
        <Field label="Linked event" htmlFor="listing-event" hint="Optional, must belong to this organization.">
          <Select
            id="listing-event"
            value={form.event_id}
            onChange={(event) => setForm((prev) => ({ ...prev, event_id: event.target.value }))}
            placeholder="No event"
            options={(events.data ?? []).map((event) => ({ value: event.id, label: event.name }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Min budget" htmlFor="listing-min">
            <Input
              id="listing-min"
              inputMode="decimal"
              value={form.min_budget}
              onChange={(event) => setForm((prev) => ({ ...prev, min_budget: event.target.value }))}
            />
          </Field>
          <Field label="Max budget" htmlFor="listing-max">
            <Input
              id="listing-max"
              inputMode="decimal"
              value={form.max_budget}
              onChange={(event) => setForm((prev) => ({ ...prev, max_budget: event.target.value }))}
            />
          </Field>
          <Field label="Currency" htmlFor="listing-currency">
            <Input
              id="listing-currency"
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
            />
          </Field>
        </div>
        <Field label="Benefits" htmlFor="listing-benefits" hint="One benefit per line.">
          <Textarea
            id="listing-benefits"
            rows={4}
            value={form.benefits}
            onChange={(event) => setForm((prev) => ({ ...prev, benefits: event.target.value }))}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        onConfirm={() => {
          if (!closeTarget) return;
          action.mutate(
            { listingId: closeTarget.id, action: 'close' },
            {
              onSuccess: () => {
                toast.success('Listing closed.');
                setCloseTarget(null);
              },
              onError: (error) => {
                setCloseTarget(null);
                toast.error(toApiError(error).message);
              },
            },
          );
        }}
        title="Close this listing?"
        description="Closing stops new proposals permanently."
        confirmLabel="Close listing"
        destructive
        loading={action.isPending}
      >
        <p>“{closeTarget?.title}” will be removed from the marketplace.</p>
      </ConfirmDialog>
    </Card>
  );
}
