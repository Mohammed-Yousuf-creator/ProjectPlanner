import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/Button';
import { BrandDot } from '@/components/ui/StatusDot';

type NavItem = { to: string; label: string; authOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: '/events', label: 'Events' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/sponsors', label: 'Sponsors' },
  { to: '/dashboard', label: 'Dashboard', authOnly: true },
  { to: '/organizations', label: 'Organizations', authOnly: true },
];

/**
 * DESIGN_SYSTEM 5.1 sticky header.
 * The recipe's search input is intentionally omitted - the backend exposes no
 * global search endpoint (see docs/OPEN_QUESTIONS.md).
 */
export function Header() {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.authOnly || isAuthenticated);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
          >
            <span className="text-2xl font-bold tracking-tight text-ink">Event Platform</span>
            <BrandDot />
            <span className="hidden rounded-lg border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-taupe sm:inline">
              Console
            </span>
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-medium text-taupe md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-forest',
                    isActive
                      ? 'bg-fill font-semibold text-ink'
                      : 'hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isAuthenticated ? (
            <>
              <div className="hidden sm:block">
                <NotificationBell />
              </div>
              <UserMenu />
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Create account</Button>
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-taupe transition-colors hover:bg-canvas hover:text-ink md:hidden"
          >
            {mobileOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-line bg-white px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-fill font-semibold text-ink' : 'text-taupe hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            {isAuthenticated ? (
              <NavLink
                to="/notifications"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-taupe transition-colors hover:text-ink"
              >
                Notifications
              </NavLink>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                <Link to="/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" block>
                    Sign in
                  </Button>
                </Link>
                <Link to="/register" onClick={() => setMobileOpen(false)}>
                  <Button block>Create account</Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
