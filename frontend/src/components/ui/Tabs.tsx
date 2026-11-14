import { cn } from '@/lib/cn';

export type TabItem = {
  value: string;
  label: string;
  /** Optional count shown as a mono suffix (e.g. task totals). */
  count?: number;
};

export type TabsProps = {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
};

/**
 * DESIGN_SYSTEM 3 - segmented control inside a rounded-xl container.
 * Deliberately NOT a pill: the container and each segment are rounded-xl.
 */
export function Tabs({ tabs, value, onChange, className, ...rest }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label'] ?? 'Tabs'}
      className={cn(
        'inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-canvas-2 p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-forest',
              active ? 'bg-white text-ink shadow-sm border border-line' : 'text-taupe hover:text-ink',
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="font-mono text-[10px] font-bold text-forest">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
