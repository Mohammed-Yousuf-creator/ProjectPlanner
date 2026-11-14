import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export type SidebarItem = {
  to: string;
  label: string;
  /** Match nested routes too (default true). */
  end?: boolean;
};

export type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

/**
 * DESIGN_SYSTEM 3 - secondary navigation rail for the Organization and Event
 * workspaces. Uses `bg-canvas-2` to sit a step behind the white content cards.
 */
export function ContextSidebar({
  sections,
  className,
}: {
  sections: SidebarSection[];
  className?: string;
}) {
  return (
    <aside
      className={cn(
        'w-full shrink-0 rounded-2xl border border-line bg-canvas-2 p-3 lg:sticky lg:top-24 lg:w-60',
        className,
      )}
    >
      {sections.map((section) => (
        <div key={section.title} className="mb-3 last:mb-0">
          <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-muted">
            {section.title}
          </p>
          <nav className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'truncate rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-forest',
                    isActive ? 'bg-white text-ink shadow-sm' : 'text-taupe hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
