import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export type PaginationProps = {
  /** Zero-based offset for limit/offset endpoints. */
  offset: number;
  limit: number;
  /** Total number of items on the current page (used to guess "has more"). */
  pageItemCount: number;
  onChange: (nextOffset: number) => void;
  disabled?: boolean;
};

/**
 * Prev/next pagination for the limit+offset endpoints. The API does not return
 * a total count, so "Next" is enabled whenever the current page came back full.
 */
export function Pagination({
  offset,
  limit,
  pageItemCount,
  onChange,
  disabled = false,
}: PaginationProps) {
  const page = Math.floor(offset / limit) + 1;
  const hasNext = pageItemCount >= limit;
  const hasPrev = offset > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-taupe">
        Page {page}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev || disabled}
          onClick={() => onChange(Math.max(0, offset - limit))}
          icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext || disabled}
          onClick={() => onChange(offset + limit)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export type PageNumberPaginationProps = {
  /** One-based page for page/page_size endpoints (check-ins, notifications, ...). */
  page: number;
  pageSize: number;
  pageItemCount: number;
  onChange: (nextPage: number) => void;
  disabled?: boolean;
};

/** Variant for endpoints that use 1-based `page` + `page_size`. */
export function PageNumberPagination({
  page,
  pageSize,
  pageItemCount,
  onChange,
  disabled = false,
}: PageNumberPaginationProps) {
  const hasNext = pageItemCount >= pageSize;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-taupe">
        Page {page}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || disabled}
          onClick={() => onChange(page - 1)}
          icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext || disabled}
          onClick={() => onChange(page + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
