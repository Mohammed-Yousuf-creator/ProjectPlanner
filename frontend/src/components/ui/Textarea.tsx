import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

/** DESIGN_SYSTEM 5.6 textarea. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full bg-canvas border rounded-xl px-3.5 py-2 text-xs text-ink leading-relaxed',
        'placeholder:text-muted focus:outline-none focus:ring-1',
        invalid
          ? 'border-red-200 focus:ring-red-800'
          : 'border-line focus:ring-forest focus:border-forest',
        'disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});
