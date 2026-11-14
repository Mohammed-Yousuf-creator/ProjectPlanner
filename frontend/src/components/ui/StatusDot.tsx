import { cn } from '@/lib/cn';

export type StatusDotTone = 'live' | 'offline' | 'warning';

const TONES: Record<StatusDotTone, string> = {
  live: 'bg-emerald-500 animate-pulse',
  offline: 'bg-muted',
  warning: 'bg-amber-500',
};

/**
 * The decorative accent square-dot used beside the wordmark (DESIGN_SYSTEM §2,
 * `h-2 w-2 bg-[#943C1D]`). Centralised here because this file is one of the two
 * places allowed to use `rounded-full`.
 */
export function BrandDot({ className }: { className?: string }) {
  return <span className={cn('h-2 w-2 shrink-0 rounded-full bg-rust', className)} aria-hidden="true" />;
}

/**
 * DESIGN_SYSTEM 5.3 live indicator.
 * One of exactly two places in the app allowed to use `rounded-full`.
 * Always accompanied by a text label so colour is never the only signal.
 */
export function StatusDot({
  tone = 'live',
  label,
  className,
}: {
  tone?: StatusDotTone;
  label?: string;
  className?: string;
}) {
  const textTone =
    tone === 'live'
      ? 'text-emerald-800'
      : tone === 'warning'
        ? 'text-amber-900'
        : 'text-taupe';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', textTone, className)}>
      <span className={cn('h-2 w-2 rounded-full', TONES[tone])} aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}
