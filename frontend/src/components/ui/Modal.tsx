import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind max-width class; defaults to max-w-xl per recipe 5.7. */
  maxWidth?: string;
  /** Prevent closing by backdrop/ESC (e.g. while showing a one-time join code). */
  dismissible?: boolean;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * DESIGN_SYSTEM 5.7 modal: focus trap, ESC to close, background scroll lock.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'max-w-xl',
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    };
    // Focus after paint so the transition does not steal it back.
    const raf = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-2xl sm:p-8 animate-fade-in',
          maxWidth,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle pb-3">
          <div>
            <h3 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h3>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-taupe">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-lg p-1 text-taupe transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mt-4 space-y-4">{children}</div>

        {footer && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-line-subtle pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
