import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** `inline` drops the card wrapper for use inside an existing panel. */
  inline?: boolean;
};

/**
 * DESIGN_SYSTEM 5.8 - honest empty state. Copy must describe the real state of
 * the system ("No events published yet."), never a placeholder dataset.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actions,
  className,
  inline = false,
}: EmptyStateProps) {
  const content = (
    <div className="mx-auto max-w-md space-y-3 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-canvas text-taupe">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {description && <p className="text-xs leading-relaxed text-taupe">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-3 pt-1">{actions}</div>}
    </div>
  );

  if (inline) return <div className={cn('py-10', className)}>{content}</div>;

  return (
    <div
      className={cn('rounded-2xl border border-line bg-white p-10 shadow-sm', className)}
    >
      {content}
    </div>
  );
}
