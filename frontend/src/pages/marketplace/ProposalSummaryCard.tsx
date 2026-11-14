import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';
import type { SponsorshipProposalRead } from '@/api/types';

/** Compact facts panel for a proposal (listing, event, package, amount). */
export function ProposalSummaryCard({ proposal }: { proposal: SponsorshipProposalRead }) {
  return (
    <Card>
      <CardHeader title="Summary" />
      <dl className="space-y-2.5 pt-3 text-[11px]">
        <Row label="Listing">{proposal.listing_title ?? proposal.listing?.title ?? '—'}</Row>
        <Row label="Target event">
          {proposal.target_event_name ?? proposal.target_event_title ?? '—'}
        </Row>
        <Row label="Package">{proposal.package_name ?? 'No package'}</Row>
        <Row label="Proposed amount">
          <span className="font-mono">
            {proposal.proposed_amount
              ? `${proposal.currency} ${proposal.proposed_amount}`
              : 'Not specified'}
          </span>
        </Row>
        <Row label="Created">{formatDate(proposal.created_at)}</Row>
        <Row label="Proposer">{proposal.proposer_organization_name ?? '—'}</Row>
        <Row label="Listing owner">{proposal.listing_owner_organization_name ?? '—'}</Row>
      </dl>
      {proposal.listing && (
        <div className="mt-3 border-t border-line-subtle pt-3">
          <p className="text-[11px] leading-relaxed text-taupe">{proposal.listing.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant={proposal.listing.listing_type === 'seeking_sponsors' ? 'category' : 'metric'}>
              {proposal.listing.listing_type === 'seeking_sponsors'
                ? 'Seeking sponsors'
                : 'Offering sponsorship'}
            </Badge>
            <Badge variant="neutral">{proposal.listing.status}</Badge>
          </div>
        </div>
      )}
    </Card>
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
