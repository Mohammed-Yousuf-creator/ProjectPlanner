import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Globe, Search, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useSponsors } from '@/hooks/useSponsorship';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { humanizeEnum, isSafeHttpUrl } from '@/lib/format';
import { toApiError } from '@/lib/errors';

/**
 * Public sponsor directory. Backed by `GET /sponsors`, which supports a `query`
 * filter server-side, so search here is real (unlike the listings marketplace).
 */
export function SponsorsPage() {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);

  const sponsors = useSponsors({ query: query || undefined, limit: DEFAULT_PAGE_SIZE, offset });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Directory"
        title="Sponsors"
        description="Organizations with published sponsorship activity, plus the listings they have open."
        actions={
          <Link to="/marketplace">
            <Button variant="outline">Browse marketplace</Button>
          </Link>
        }
      />

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft.trim());
          setOffset(0);
        }}
      >
        <Input
          aria-label="Search sponsors"
          placeholder="Search by organization name…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" size="sm" icon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}>
          Search
        </Button>
        {query && (
          <Button
            type="button"
            variant="chip"
            size="sm"
            onClick={() => {
              setQuery('');
              setDraft('');
              setOffset(0);
            }}
          >
            Clear
          </Button>
        )}
      </form>

      {sponsors.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : sponsors.isError ? (
        <ErrorState error={sponsors.error} onRetry={() => void sponsors.refetch()} />
      ) : !sponsors.data || sponsors.data.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={query ? 'No sponsors match that search' : 'No sponsors listed yet'}
          description={
            query
              ? `Nothing matched “${query}”. Try a shorter search.`
              : 'Organizations appear here once they publish a sponsorship listing.'
          }
          actions={
            query ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setDraft('');
                }}
              >
                Clear search
              </Button>
            ) : (
              <Link to="/marketplace">
                <Button>Open the marketplace</Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sponsors.data.map((sponsor) => (
              <Card key={sponsor.id} className="flex h-full flex-col gap-3 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {sponsor.logo_url && isSafeHttpUrl(sponsor.logo_url) ? (
                      <img
                        src={sponsor.logo_url}
                        alt=""
                        className="h-8 w-8 rounded-lg border border-line object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-canvas text-taupe">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                    <h3 className="truncate text-sm font-bold text-ink">{sponsor.name}</h3>
                  </div>
                  <Badge variant="metric">{sponsor.published_listings_count} listings</Badge>
                </div>

                {sponsor.description && (
                  <p className="line-clamp-3 text-xs leading-relaxed text-taupe">{sponsor.description}</p>
                )}

                {sponsor.public_listings.length > 0 && (
                  <ul className="space-y-1.5 border-t border-line-subtle pt-2">
                    {sponsor.public_listings.slice(0, 2).map((listing) => (
                      <li key={listing.id}>
                        <Link
                          to={`/marketplace/${listing.id}`}
                          className="group flex items-center justify-between gap-2"
                        >
                          <span className="truncate text-[11px] font-semibold text-ink group-hover:text-rust">
                            {listing.title}
                          </span>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted">
                            {humanizeEnum(listing.listing_type)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-line-subtle pt-2">
                  {sponsor.website_url && isSafeHttpUrl(sponsor.website_url) ? (
                    <a
                      href={sponsor.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest hover:underline"
                    >
                      <Globe className="h-3 w-3" aria-hidden="true" /> Website
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted">No website</span>
                  )}
                  {sponsor.published_listings_count > 0 && (
                    <Link
                      to="/marketplace"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-rust hover:underline"
                    >
                      <Sparkles className="h-3 w-3" aria-hidden="true" /> Listings
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={DEFAULT_PAGE_SIZE}
            pageItemCount={sponsors.data.length}
            onChange={setOffset}
          />
        </>
      )}

      <p className="text-[11px] text-muted">
        {sponsors.isError
          ? toApiError(sponsors.error).message
          : 'Only organizations with published listings appear in this directory.'}
      </p>
    </div>
  );
}
