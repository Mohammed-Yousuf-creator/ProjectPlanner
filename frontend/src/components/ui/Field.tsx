import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type FieldProps = {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

/** DESIGN_SYSTEM 5.6 - label + control + helper/error, all stacked tightly. */
export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-rust">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-red-800">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
