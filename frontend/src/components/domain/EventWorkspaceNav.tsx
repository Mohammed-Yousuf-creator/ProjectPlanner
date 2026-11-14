import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export type EventWorkspaceTab = {
  to: string;
  label: string;
  /** Hide tabs that need a login when the viewer is anonymous. */
  requiresAuth?: boolean;
};

/** Sub-navigation shared by every page that lives under `/events/:eventId`. */
export function EventWorkspaceNav({
  eventId,
  isAuthenticated,
  className,
}: {
  eventId: string;
  isAuthenticated: boolean;
  className?: string;
}) {
  const base = `/events/${eventId}`;
  const tabs: EventWorkspaceTab[] = [
    { to: base, label: 'Overview' },
    { to: `${base}/schedule`, label: 'Schedule' },
    { to: `${base}/teams`, label: 'Teams', requiresAuth: true },
    { to: `${base}/projects`, label: 'Projects', requiresAuth: true },
    { to: `${base}/matchmaking`, label: 'Matchmaking', requiresAuth: true },
    { to: `${base}/leaderboard`, label: 'Leaderboard' },
    { to: `${base}/announcements`, label: 'Announcements', requiresAuth: true },
    { to: `${base}/mentor`, label: 'Mentor desk', requiresAuth: true },
  ];

  const visible = tabs.filter((tab) => !tab.requiresAuth || isAuthenticated);

  return (
    <nav
      aria-label="Event sections"
      className={cn(
        'flex gap-1 overflow-x-auto rounded-xl border border-line bg-canvas-2 p-1',
        className,
      )}
    >
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === base}
          className={({ isActive }) =>
            cn(
              'whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-forest',
              isActive ? 'border border-line bg-white text-ink shadow-sm' : 'text-taupe hover:text-ink',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
