import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastContextValue = {
  push: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <CheckCircle2 className="h-4 w-4 text-forest" aria-hidden="true" />,
  },
  error: {
    wrapper: 'border-red-200 bg-red-50 text-red-800',
    icon: <XCircle className="h-4 w-4 text-red-800" aria-hidden="true" />,
  },
  info: {
    wrapper: 'border-line bg-white text-ink',
    icon: <Info className="h-4 w-4 text-taupe" aria-hidden="true" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((current) => [...current.slice(-3), { id, tone, message }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (message: string) => push(message, 'success'),
      error: (message: string) => push(message, 'error'),
      info: (message: string) => push(message, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-20 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const styles = TONE_STYLES[item.tone];

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, item.tone === 'error' ? 7000 : 4500);
    return () => window.clearTimeout(timer);
  }, [item.tone, onDismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-md animate-slide-in',
        styles.wrapper,
      )}
    >
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <p className="flex-1 text-xs font-medium leading-relaxed">{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="rounded-lg p-0.5 opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
