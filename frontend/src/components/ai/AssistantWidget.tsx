import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { cn } from '@/lib/cn';

/**
 * Floating assistant launcher, mounted once in `AppShell`.
 *
 * Rendered through a portal-free fixed container so it never affects page
 * layout. Hidden on the dedicated `/assistant` route, which renders the same
 * `ChatPanel` full-page — two chat surfaces on one screen would be confusing and
 * would double-subscribe to the same queries.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);

  // Escape closes the panel, matching the modal convention elsewhere.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {open && (
        <div
          className={cn(
            'fixed bottom-20 right-4 z-40 flex h-[32rem] w-[min(24rem,calc(100vw-2rem))] flex-col',
            'rounded-2xl border border-line bg-white p-4 shadow-xl animate-fade-in',
          )}
          role="dialog"
          aria-label="Platform assistant"
        >
          <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">Platform assistant</h2>
              <p className="text-[11px] text-taupe">Answers from this app's own docs.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-muted transition-colors hover:bg-hover-stone hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ChatPanel className="min-h-0 flex-1" />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-xl',
          'border border-transparent bg-forest px-3.5 py-2.5 text-xs font-semibold text-white',
          'shadow-lg transition-colors hover:bg-forest-dark',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2',
        )}
        aria-label={open ? 'Close the assistant' : 'Open the assistant'}
        aria-expanded={open}
      >
        {open ? (
          <X className="h-4 w-4" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{open ? 'Close' : 'Ask AI'}</span>
      </button>
    </>
  );
}
