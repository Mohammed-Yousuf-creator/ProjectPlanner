import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'chip' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  /** Stretch to the container width (forms inside modals/cards). */
  block?: boolean;
};

/** DESIGN_SYSTEM 5.2 - every button is `rounded-xl`, never a pill. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-forest text-white hover:bg-forest-dark border border-transparent shadow-sm',
  dark: 'bg-ink text-canvas hover:bg-obsidian-hover border border-transparent shadow-sm',
  outline:
    'bg-white border border-line text-ink hover:bg-canvas shadow-sm',
  chip: 'bg-canvas hover:bg-hover-stone border border-line text-taupe hover:text-ink',
  danger: 'bg-red-800 text-white hover:bg-red-900 border border-transparent shadow-sm',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[11px]',
  md: 'px-4 py-2 text-xs',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    block = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-forest',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
