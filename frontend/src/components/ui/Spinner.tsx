import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-8 text-taupe', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span className="text-xs font-medium">{label ?? 'Loading…'}</span>
    </div>
  );
}
