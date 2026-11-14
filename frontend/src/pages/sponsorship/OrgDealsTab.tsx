import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileSignature } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useOrgSponsorshipDeals } from '@/hooks/useSponsorship';
import { DEAL_STATUSES, TABLE_PAGE_SIZE } from '@/lib/constants';
import { formatDate, humanizeEnum } from '@/lib/format';
import type { SponsorshipDealRead } from '@/api/types';

/** Deals list for one organization with status filtering and limit/offset paging. */
export function OrgDealsTab({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [eventId, setEventId] = useState('');

  const deals = useOrgSponsorshipDeals(orgId, {
    status: status || undefined,
    event_id: eventId || undefined,
    limit: TABLE_PAGE_SIZE,
    offset,
  });

  const columns: DataTableColumn<SponsorshipDealRead>[] = [
    {
      key: 'event',
      header: 'Event / partner',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {row.event_name ?? row.event_title ?? 'Event'}
          </p>
          <p className="truncate text-[11px] text-taupe">
            {row.sponsor_organization_name ?? 'Sponsor'} ×{' '}
            {row.organizer_organization_name ?? 'Organizer'}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="font-mono text-[11px] font-semibold text-forest">
          {row.currency} {row.agreed_amount}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'deliverables',
      header: 'Deliverables',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">
          {row.completed_deliverables_count}/{row.deliverables_count}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      render: (row) => (
        <span className="font-mono text-[11px] text-muted">
          {row.starts_at ? formatDate(row.starts_at) : '—'} →{' '}
          {row.ends_at ? formatDate(row.ends_at) : '—'}
        </span>
      ),
    },
    {
      key: 'open',
      header: '',
      render: (row) => (
        <Link
          to={`/sponsorship/deals/${row.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rust hover:underline"
        >
          Open
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      ),
    },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="space-y-3 p-5">
        <CardHeader
          title="Deals"
          description="Deals are created when a proposal is accepted and snapshot the agreed terms."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Filter by event id"
                placeholder="Event id (optional)"
                value={eventId}
                onChange={(event) => {
                  setEventId(event.target.value.trim());
                  setOffset(0);
                }}
                className="w-48"
              />
              <Select
                aria-label="Filter by deal status"
                className="w-40"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setOffset(0);
                }}
                placeholder="Any status"
                options={DEAL_STATUSES.map((value) => ({ value, label: humanizeEnum(value) }))}
              />
            </div>
          }
        />
      </div>

      {deals.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonTable rows={4} />
        </div>
      ) : deals.isError ? (
        <div className="px-5 pb-5">
          <ErrorState error={deals.error} onRetry={() => void deals.refetch()} />
        </div>
      ) : !deals.data || deals.data.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            inline
            icon={FileSignature}
            title="No deals yet"
            description="Accepting a proposal creates the first deal for this organization."
          />
        </div>
      ) : (
        <>
          <DataTable columns={columns} rows={deals.data} rowKey={(row) => row.id} className="px-2" />
          <div className="border-t border-line-subtle p-4">
            <Pagination
              offset={offset}
              limit={TABLE_PAGE_SIZE}
              pageItemCount={deals.data.length}
              onChange={setOffset}
            />
          </div>
        </>
      )}

      <div className="border-t border-line-subtle p-4">
        <Button variant="chip" size="sm" onClick={() => setOffset(0)}>
          Reset filters
        </Button>
      </div>
    </Card>
  );
}
