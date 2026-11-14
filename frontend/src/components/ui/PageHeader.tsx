import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Breadcrumb = { label: string; to?: string };

export type PageHeaderProps = {
  title: string;
  description?: string;
  /** Small uppercase mono label above the H1 (e.g. "Organizer console"). */
  eyebrow?: string;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  className?: string;
};

/** DESIGN_SYSTEM 4 typography - H1 line plus an actions slot. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                {crumb.to ? (
                  <Link
                    to={crumb.to}
                    className="rounded transition-colors hover:text-rust focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-taupe">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {eyebrow && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-rust">{eyebrow}</p>
          )}
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
          {description && <p className="max-w-2xl text-sm leading-relaxed text-taupe">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
