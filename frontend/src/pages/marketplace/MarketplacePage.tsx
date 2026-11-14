import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HandCoins, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useSponsorshipListings } from '@/hooks/useSponsorship';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_PAGE_SIZE, LISTING_TYPES } from '@/lib/constants';
import { humanizeEnum } from '@/lib/format';
import { ListingCard } from './ListingCard';

const TABS: TabItem[] = [
  { value: '', label: 'All listings' },
  ...LISTING_TYPES.map((type) => ({ value: type.value, label: type.label })),
];

/**
 * Public sponsorship marketplace.
 * The backend has no text-search endpoint for listings, so filtering is limited
 * to `listing_type` plus client-side matching on the current page.
 */
export function MarketplacePage() {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const [listingType, setListingType] = useState('');
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');

  const listings = useSponsorshipListings({
    listing_type: listingType ? (listingType as 'seeking_sponsors' | 'offering_sponsorship') : undefined,
    limit: DEFAULT_PAGE_SIZE,
    offset,
  });

  const visible = search
    ? (listings.data ?? []).filter((listing) => {
        const needle = search.toLowerCase();
        return (
          listing.title.toLowerCase().includes(needle) ||
          (listing.description ?? '').toLowerCase().includes(needle)
        );
      })
    : (listings.data ?? []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sponsorship"
        title="Marketplace"
        description="Events seeking sponsors meet organizations offering sponsorship."
        actions={
          isAuthenticated ? (
            <Link to="/organizations">
              <Button icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                Create a listing
              </Button>
            </Link>
          ) : (
            <Link to="/login?next=/marketplace">
              <Button variant="outline">Sign in to post</Button>
            </Link>
          )
        }
      />

      <Tabs
        tabs={TABS}
        value={listingType}
        onChange={(value) => {
          setListingType(value);
          setOffset(0);
        }}
        aria-label="Filter by listing type"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search listings on this page"
          placeholder="Filter this page by title…"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              setSearch(searchDraft.trim());
            }
          }}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSearch(searchDraft.trim())}
        >
          Filter
        </Button>
        {search && (
          <Button
            variant="chip"
            size="sm"
            onClick={() => {
              setSearch('');
              setSearchDraft('');
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted">
          {listings.data ? `${listings.data.length} on this page` : ''}
        </span>
      </div>

      {listings.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : listings.isError ? (
        <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={search ? 'No listings match that filter' : 'No listings yet'}
          description={
            search
              ? 'Server-side search is not available; only the current page was filtered.'
              : 'Organizations and organizers can publish the first sponsorship listing.'
          }
          actions={
            search ? (
              <Button variant="outline" onClick={() => setSearch('')}>
                Clear filter
              </Button>
            ) : (
              <Link to="/organizations">
                <Button>Go to my organizations</Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={DEFAULT_PAGE_SIZE}
            pageItemCount={listings.data?.length ?? 0}
            onChange={setOffset}
          />
        </>
      )}

      <p className="text-[11px] text-muted">
        Listing types: {LISTING_TYPES.map((type) => humanizeEnum(type.value)).join(' · ')}. Deals are
        negotiated per proposal, one active deal per proposal.
      </p>
    </div>
  );
}
