import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

/** DESIGN_SYSTEM 5.6 text input. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type = 'text', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'w-full bg-canvas border rounded-xl px-3.5 py-2 text-xs text-ink',
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
