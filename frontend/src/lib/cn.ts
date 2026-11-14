import clsx, { type ClassValue } from 'clsx';

/** Tiny clsx wrapper so class composition reads consistently across components. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
