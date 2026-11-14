import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Handshake } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { useOrgSponsorshipProposals } from '@/hooks/useSponsorship';
import { PROPOSAL_STATUSES } from '@/lib/constants';
import { formatDate, humanizeEnum } from '@/lib/format';
import type { SponsorshipProposalRead } from '@/api/types';

/**
 * Proposals for one organization, split by direction:
 * `incoming` = proposals against this organization's listings,
 * `outgoing` = proposals this organization sent.
 */
export function OrgProposalsTab({
  orgId,
  direction,
}: {
  orgId: string;
  direction: 'incoming' | 'outgoing';
}) {
  const [status, setStatus] = useState('');
  const proposals = useOrgSponsorshipProposals(orgId, {
    direction,
    status: status || undefined,
  });

  const counterparty = (row: SponsorshipProposalRead) =>
    direction === 'incoming'
      ? row.proposer_organization_name ?? 'Unknown organization'
      : row.listing_owner_organization_name ?? 'Unknown organization';

  const columns: DataTableColumn<SponsorshipProposalRead>[] = [
    {
      key: 'listing',
      header: 'Listing / event',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {row.listing_title ?? row.listing?.title ?? 'Listing'}
          </p>
          <p className="truncate text-[11px] text-taupe">
            {row.target_event_name ?? row.target_event_title ?? 'Event'}
          </p>
        </div>
      ),
    },
    {
      key: 'counterparty',
      header: direction === 'incoming' ? 'From' : 'To',
      render: (row) => <span className="text-[11px] text-taupe">{counterparty(row)}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="font-mono text-[11px] text-ink">
          {row.proposed_amount ? `${row.currency} ${row.proposed_amount}` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'created',
      header: 'Received',
      render: (row) => (
        <span className="font-mono text-[11px] text-muted">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'open',
      header: '',
      render: (row) => (
        <Link
          to={`/sponsorship/proposals/${row.id}`}
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
          title={direction === 'incoming' ? 'Incoming proposals' : 'Proposals we sent'}
          description={
            direction === 'incoming'
              ? 'Sponsors proposing against your listings. Accepting creates a deal.'
              : 'Track responses to your proposals and continue negotiating.'
          }
          actions={
            <Select
              aria-label="Filter by proposal status"
              className="w-44"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              placeholder="Any status"
              options={PROPOSAL_STATUSES.map((value) => ({ value, label: humanizeEnum(value) }))}
            />
          }
        />
      </div>

      {proposals.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonTable rows={4} />
        </div>
      ) : proposals.isError ? (
        <div className="px-5 pb-5">
          <ErrorState error={proposals.error} onRetry={() => void proposals.refetch()} />
        </div>
      ) : !proposals.data || proposals.data.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            inline
            icon={Handshake}
            title={direction === 'incoming' ? 'No incoming proposals' : 'No proposals sent yet'}
            description={
              direction === 'incoming'
                ? 'Publish a listing to start receiving proposals.'
                : 'Browse the marketplace and propose against a listing you like.'
            }
            actions={
              direction === 'incoming' ? undefined : (
                <Link to="/marketplace">
                  <Button>Browse marketplace</Button>
                </Link>
              )
            }
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={proposals.data}
          rowKey={(row) => row.id}
          className="px-2"
        />
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle p-4">
        <Badge variant="neutral">negotiating</Badge>
        <span className="text-[11px] text-muted">
          A proposal stays open while it is pending or negotiating; both sides can post counter
          offers.
        </span>
      </div>
    </Card>
  );
}
