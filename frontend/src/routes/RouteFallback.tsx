import { SkeletonLines } from '@/components/ui/Skeleton';

/**
 * Fallback shown while a lazily loaded route module is fetched.
 * Deliberately layout-stable so the page header does not jump on arrival.
 */
export function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="space-y-2">
        <SkeletonLines lines={1} className="max-w-[10rem]" />
        <SkeletonLines lines={1} className="max-w-sm" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-2xl border border-line bg-white shadow-sm" />
        <div className="h-40 rounded-2xl border border-line bg-white shadow-sm" />
      </div>
      <SkeletonLines lines={4} />
    </div>
  );
}
