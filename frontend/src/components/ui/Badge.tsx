import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { humanizeEnum } from '@/lib/format';

export type BadgeVariant =
  | 'metric'
  | 'category'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'neutral'
  | 'danger'
  | 'warning'
  | 'forest'
  | 'live';

const VARIANTS: Record<BadgeVariant, string> = {
  metric:
    'text-[11px] font-mono font-semibold text-forest px-2 py-0.5 bg-emerald-50 rounded-lg border border-emerald-200',
  category:
    'text-[11px] font-mono uppercase font-semibold text-rust px-2.5 py-0.5 bg-canvas rounded-lg border border-line',
  gold: 'rounded-lg text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5',
  silver:
    'rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5',
  bronze:
    'rounded-lg text-xs font-semibold bg-orange-100 text-orange-900 border border-orange-300 px-2.5 py-0.5',
  neutral:
    'rounded-lg text-[11px] font-mono uppercase font-semibold text-taupe bg-canvas-2 border border-line px-2 py-0.5',
  danger:
    'rounded-lg text-[11px] font-mono uppercase font-semibold text-red-800 bg-red-50 border border-red-200 px-2 py-0.5',
  warning:
    'rounded-lg text-[11px] font-mono uppercase font-semibold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5',
  forest:
    'rounded-lg text-[11px] font-mono uppercase font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5',
  live: 'inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800',
};

export type BadgeProps = {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
};

/** DESIGN_SYSTEM 5.3 - all chips are rounded-lg, mono, uppercase where technical. */
export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', VARIANTS[variant], className)}>
      {children}
    </span>
  );
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const TONE_TO_VARIANT: Record<StatusTone, BadgeVariant> = {
  success: 'forest',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
  info: 'category',
};

/**
 * Central mapping from backend status strings to a badge tone, so that the same
 * status always looks the same across pages.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  // events
  draft: 'neutral',
  published: 'success',
  registration_open: 'info',
  in_progress: 'info',
  completed: 'neutral',
  cancelled: 'danger',
  // registrations
  registered: 'info',
  approved: 'success',
  waitlisted: 'warning',
  rejected: 'danger',
  withdrawn: 'neutral',
  // teams
  forming: 'warning',
  active: 'success',
  submitted: 'info',
  disbanded: 'danger',
  // tasks
  todo: 'neutral',
  review: 'warning',
  done: 'success',
  // priorities
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
  // announcements / listings / proposals / deals / deliverables
  negotiating: 'warning',
  accepted: 'success',
  expired: 'neutral',
  closed: 'neutral',
  active_deal: 'success',
  pending: 'warning',
  in_progress_deliverable: 'info',
  // mentor requests
  assigned: 'info',
  resolved: 'success',
  // evaluations
  submitted_evaluation: 'success',
};

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return STATUS_TONES[status] ?? 'neutral';
}

/** Renders any backend status string with consistent tone and spacing. */
export function StatusBadge({
  status,
  className,
  variant,
}: {
  status: string | null | undefined;
  className?: string;
  variant?: BadgeVariant;
}) {
  if (!status) return null;
  return (
    <Badge variant={variant ?? TONE_TO_VARIANT[statusTone(status)]} className={className}>
      {humanizeEnum(status)}
    </Badge>
  );
}
