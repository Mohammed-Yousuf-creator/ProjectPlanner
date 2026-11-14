import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, CalendarRange, Coins } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { formatDate, humanizeEnum } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { SponsorshipListingRead } from '@/api/types';

const TYPE_LABEL: Record<string, string> = {
  seeking_sponsors: 'Seeking sponsors',
  offering_sponsorship: 'Offering sponsorship',
};

/** Summary card used on the marketplace grid. */
export function ListingCard({
  listing,
  className,
}: {
  listing: SponsorshipListingRead;
  className?: string;
}) {
  const isSeeking = listing.listing_type === 'seeking_sponsors';
  const hasBudget = Boolean(listing.min_budget || listing.max_budget);

  return (
    <Card
      className={cn('group flex h-full flex-col gap-3 transition-shadow hover:shadow-md', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant={isSeeking ? 'category' : 'metric'}>
          {TYPE_LABEL[listing.listing_type] ?? humanizeEnum(listing.listing_type)}
        </Badge>
        {listing.status !== 'active' && (
          <Badge variant="neutral">{humanizeEnum(listing.status)}</Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-sm font-bold leading-snug text-ink">{listing.title}</h3>
        {listing.description && (
          <p className="line-clamp-3 text-xs leading-relaxed text-taupe">{listing.description}</p>
        )}
      </div>

      <dl className="mt-auto space-y-1.5 border-t border-line-subtle pt-3 text-[11px]">
        {listing.owner_organization_name && (
          <div className="flex items-center gap-1.5 text-taupe">
            <Building2 className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">{listing.owner_organization_name}</span>
          </div>
        )}
        {(listing.event_name || listing.event_title) && (
          <div className="flex items-center gap-1.5 text-taupe">
            <CalendarRange className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">{listing.event_name ?? listing.event_title}</span>
          </div>
        )}
        {hasBudget && (
          <div className="flex items-center gap-1.5 text-taupe">
            <Coins className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate font-mono">
              {listing.currency} {listing.min_budget ?? '0'} – {listing.max_budget ?? 'open'}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {formatDate(listing.created_at)}
          </span>
          <Link
            to={`/marketplace/${listing.id}`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rust hover:underline"
          >
            Details
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </dl>

      {listing.packages.length > 0 && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {listing.packages.length} {listing.packages.length === 1 ? 'package' : 'packages'}
        </p>
      )}
    </Card>
  );
}
