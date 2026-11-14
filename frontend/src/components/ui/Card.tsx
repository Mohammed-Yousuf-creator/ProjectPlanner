import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds the rust hover border + shadow lift from recipe 5.4. */
  interactive?: boolean;
  padded?: boolean;
};

/** DESIGN_SYSTEM 5.4 / 3 - the base surface for every panel in the app. */
export function Card({ interactive, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-line rounded-2xl shadow-sm',
        padded && 'p-6',
        interactive &&
          'transition-all hover:border-rust/60 hover:shadow-md cursor-pointer group',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-4',
        className,
      )}
    >
      <div>
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-taupe">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
