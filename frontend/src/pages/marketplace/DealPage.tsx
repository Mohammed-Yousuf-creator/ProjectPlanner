import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Handshake, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
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
  useCreateDeliverable,
  useDealDeliverables,
  useSponsorshipDeal,
  useUpdateDealStatus,
  useUpdateDeliverable,
} from '@/hooks/useSponsorship';
import { formatDate } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import { DeliverableRow } from './DeliverableRow';

/**
 * Deal detail: immutable terms + deliverable tracking.
 * The backend only ever allows `active → completed|cancelled`, and each
 * deliverable is owned by one of the two organizations.
 */
export function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const toast = useToast();

  const dealQuery = useSponsorshipDeal(dealId);
  const deliverables = useDealDeliverables(dealId);
  const updateStatus = useUpdateDealStatus(dealId ?? '');
  const createDeliverable = useCreateDeliverable(dealId ?? '');
  const updateDeliverable = useUpdateDeliverable(dealId ?? '');

  const [statusTarget, setStatusTarget] = useState<'completed' | 'cancelled' | null>(null);
  const [deliverableModalOpen, setDeliverableModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', due_at: '', organization: '' });

  if (dealQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-sm" />
        <Card>
          <SkeletonLines lines={6} />
        </Card>
      </div>
    );
  }

  if (dealQuery.isError) {
    const apiError = toApiError(dealQuery.error);
    if (apiError.status === 403 || apiError.status === 404) {
      return (
        <EmptyState
          icon={Handshake}
          title="Deal unavailable"
          description="It does not exist, or your organization is not a party to it."
          actions={
            <Link to="/organizations">
              <Button variant="outline">My organizations</Button>
            </Link>
          }
        />
      );
    }
    return <ErrorState error={dealQuery.error} onRetry={() => void dealQuery.refetch()} />;
  }

  const deal = dealQuery.data;
  if (!deal) return null;

  const isActive = deal.status === 'active';
  const completed = deal.completed_deliverables_count;
  const total = deal.deliverables_count;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const submitDeliverable = () => {
    if (!form.title.trim()) {
      toast.error('A deliverable title is required.');
      return;
    }
    if (!form.organization) {
      toast.error('Choose which organization is responsible.');
      return;
    }
    createDeliverable.mutate(
      {
        responsible_organization_id: form.organization,
        title: form.title.trim(),
        description: form.description.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Deliverable added.');
          setDeliverableModalOpen(false);
          setForm({ title: '', description: '', due_at: '', organization: '' });
        },
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sponsorship deal"
        title={deal.event_name ?? deal.event_title ?? 'Sponsorship deal'}
        description={`${deal.sponsor_organization_name ?? 'Sponsor'} × ${deal.organizer_organization_name ?? 'Organizer'}`}
        breadcrumbs={[
          { label: 'Marketplace', to: '/marketplace' },
          { label: 'Deal' },
        ]}
        actions={<StatusBadge status={deal.status} />}
      />

      {!isActive && (
        <Alert tone="info" title={`This deal is ${deal.status}`}>
          {deal.status === 'completed'
            ? 'Both parties consider the sponsorship fulfilled.'
            : 'The deal was cancelled and no further deliverables can be completed.'}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="space-y-3">
            <CardHeader
              title="Deliverables"
              description="Each deliverable has exactly one responsible organization."
              actions={
                isActive ? (
                  <Button
                    size="sm"
                    onClick={() => setDeliverableModalOpen(true)}
                    icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    Add deliverable
                  </Button>
                ) : undefined
              }
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
                <span>
                  {completed} of {total} complete
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-lg bg-canvas-2">
                <div
                  className="h-full rounded-lg bg-forest transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {deliverables.isLoading ? (
              <SkeletonLines lines={4} />
            ) : deliverables.isError ? (
              <ErrorState error={deliverables.error} onRetry={() => void deliverables.refetch()} />
            ) : !deliverables.data || deliverables.data.length === 0 ? (
              <EmptyState
                inline
                icon={CheckCircle2}
                title="No deliverables yet"
                description="Define what the sponsor receives so both sides can track delivery."
                actions={
                  isActive ? (
                    <Button onClick={() => setDeliverableModalOpen(true)}>Add the first one</Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {deliverables.data.map((item) => (
                  <li key={item.id}>
                    <DeliverableRow
                      deliverable={item}
                      disabled={!isActive}
                      onStatusChange={(status) =>
                        updateDeliverable.mutate(
                          { deliverableId: item.id, body: { status } },
                          {
                            onSuccess: () => toast.success('Deliverable updated.'),
                            onError: (error) => toast.error(toApiError(error).message),
                          },
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Terms" description="Snapshot at acceptance — immutable." />
            <dl className="space-y-2.5 pt-3 text-[11px]">
              <Row label="Agreed amount">
                <span className="font-mono">
                  {deal.currency} {deal.agreed_amount}
                </span>
              </Row>
              <Row label="Sponsor">{deal.sponsor_organization_name ?? '—'}</Row>
              <Row label="Organizer">{deal.organizer_organization_name ?? '—'}</Row>
              <Row label="Event">{deal.event_name ?? deal.event_title ?? '—'}</Row>
              <Row label="Starts">{deal.starts_at ? formatDate(deal.starts_at) : 'Not set'}</Row>
              <Row label="Ends">{deal.ends_at ? formatDate(deal.ends_at) : 'Not set'}</Row>
              <Row label="Created">{formatDate(deal.created_at)}</Row>
            </dl>
            {Array.isArray(deal.agreed_terms) && deal.agreed_terms.length > 0 && (
              <div className="mt-3 border-t border-line-subtle pt-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Agreed terms
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-taupe">
                  {(deal.agreed_terms as string[]).map((term) => (
                    <li key={term}>{term}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {isActive && (
            <Card className="space-y-2">
              <CardHeader title="Close the deal" />
              <div className="space-y-2 pt-2">
                <Button block onClick={() => setStatusTarget('completed')}>
                  Mark completed
                </Button>
                <Button variant="outline" block onClick={() => setStatusTarget('cancelled')}>
                  Cancel deal
                </Button>
                <p className="text-[10px] leading-relaxed text-muted">
                  Deals only move forward: once completed or cancelled they cannot be reopened.
                </p>
              </div>
              {updateStatus.isError && (
                <Alert tone="error" title="Could not update the deal">
                  {toApiError(updateStatus.error).message}
                </Alert>
              )}
            </Card>
          )}
        </div>
      </div>

      <Link
        to="/organizations"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-taupe hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back to organizations
      </Link>

      <Modal
        open={deliverableModalOpen}
        onClose={() => setDeliverableModalOpen(false)}
        title="New deliverable"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeliverableModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDeliverable} loading={createDeliverable.isPending}>
              Add deliverable
            </Button>
          </>
        }
      >
        {createDeliverable.isError && (
          <Alert tone="error" title="Could not add the deliverable">
            {toApiError(createDeliverable.error).message}
          </Alert>
        )}
        <Field label="Title" htmlFor="deliverable-title" required>
          <Input
            id="deliverable-title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Logo on event page"
          />
        </Field>
        <Field label="Description" htmlFor="deliverable-description">
          <Textarea
            id="deliverable-description"
            rows={2}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </Field>
        <Field label="Responsible organization" htmlFor="deliverable-org" required>
          <Select
            id="deliverable-org"
            value={form.organization}
            onChange={(event) => setForm((prev) => ({ ...prev, organization: event.target.value }))}
            placeholder="Select an organization"
            options={[
              {
                value: deal.sponsor_organization_id,
                label: deal.sponsor_organization_name ?? 'Sponsor',
              },
              {
                value: deal.organizer_organization_id,
                label: deal.organizer_organization_name ?? 'Organizer',
              },
            ]}
          />
        </Field>
        <Field
          label="Due date"
          htmlFor="deliverable-due"
          hint="Optional. The API stores dates; time-of-day is not sent."
        >
          <Input
            id="deliverable-due"
            type="date"
            value={form.due_at}
            onChange={(event) => setForm((prev) => ({ ...prev, due_at: event.target.value }))}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => {
          if (!statusTarget) return;
          updateStatus.mutate(
            { status: statusTarget },
            {
              onSuccess: () => {
                toast.success(`Deal ${statusTarget}.`);
                setStatusTarget(null);
              },
              onError: (error) => {
                setStatusTarget(null);
                toast.error(toApiError(error).message);
              },
            },
          );
        }}
        title={statusTarget === 'completed' ? 'Mark this deal completed?' : 'Cancel this deal?'}
        description="This cannot be undone."
        confirmLabel={statusTarget === 'completed' ? 'Mark completed' : 'Cancel deal'}
        destructive={statusTarget === 'cancelled'}
        loading={updateStatus.isPending}
      >
        <p>
          {statusTarget === 'completed'
            ? 'Mark it complete only when every deliverable has been delivered.'
            : 'Cancelling ends the sponsorship. Deliverables can no longer be updated.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="max-w-[60%] text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}
