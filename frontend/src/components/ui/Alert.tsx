import type { ReactNode } from 'react';
import { AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AlertTone = 'error' | 'info' | 'success' | 'warning';

const TONES: Record<AlertTone, { wrapper: string; icon: ReactNode }> = {
  error: {
    wrapper: 'border-red-200 bg-red-50 text-red-800',
    icon: <AlertCircle className="h-4 w-4 shrink-0 text-red-800" aria-hidden="true" />,
  },
  info: {
    wrapper: 'border-line bg-canvas text-taupe',
    icon: <Info className="h-4 w-4 shrink-0 text-taupe" aria-hidden="true" />,
  },
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />,
  },
  warning: {
    wrapper: 'border-amber-300 bg-amber-100 text-amber-900',
    icon: <AlertCircle className="h-4 w-4 shrink-0 text-amber-900" aria-hidden="true" />,
  },
};

/** Inline message block used for server `detail` text and page-level notes. */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
  actions,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const styles = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-xl border p-3', styles.wrapper, className)}
    >
      <span className="mt-0.5">{styles.icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="text-xs font-bold">{title}</p>}
        {children && <div className="text-xs leading-relaxed">{children}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
