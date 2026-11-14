import { cn } from '@/lib/cn';

/** `bg-fill rounded-xl animate-pulse` per PLAN.md Phase 2. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-fill', className)} aria-hidden="true" />;
}

export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <SkeletonLines lines={2} />
      <div className="flex items-center justify-between border-t border-line-subtle pt-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}
