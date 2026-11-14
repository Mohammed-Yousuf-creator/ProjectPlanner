import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
};

/** DESIGN_SYSTEM 5.6 select - native element for full a11y/keyboard behaviour. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, invalid, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none bg-canvas border rounded-xl pl-3 pr-8 py-2 text-xs text-ink cursor-pointer',
          'focus:outline-none focus:ring-1 disabled:opacity-60',
          invalid
            ? 'border-red-200 focus:ring-red-800'
            : 'border-line focus:ring-forest focus:border-forest',
          className,
        )}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  );
});
