import { cn } from '@/lib/cn';
import { getInitials, isSafeHttpUrl } from '@/lib/format';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
} as const;

export type AvatarProps = {
  name?: string | null;
  username?: string | null;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

/**
 * DESIGN_SYSTEM 3 circular identity badge.
 * One of exactly two places in the app allowed to use `rounded-full`.
 * Only `avatar_url` values from the schema are ever rendered, and only when the
 * URL is http(s) - an unknown string is never used as an image source.
 */
export function Avatar({ name, username, src, size = 'sm', className }: AvatarProps) {
  const initials = getInitials(name, username);
  const showImage = isSafeHttpUrl(src);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-rust font-bold uppercase text-white',
        SIZES[size],
        className,
      )}
      title={name ?? username ?? undefined}
      aria-hidden={showImage ? undefined : 'true'}
    >
      {showImage ? (
        <img src={src ?? undefined} alt={name ?? username ?? 'avatar'} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
