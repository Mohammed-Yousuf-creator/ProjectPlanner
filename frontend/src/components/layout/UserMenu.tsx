import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut, Building2, Bell } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore, getDisplayName } from '@/stores/authStore';
import { useLogout } from '@/hooks/useAuth';

/** Avatar + dropdown with account links and Sign out (recipe 5.1). */
export function UserMenu() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const displayName = getDisplayName(user);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-xl border border-line bg-white p-1 pr-2 transition-colors hover:bg-canvas focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
      >
        <Avatar name={displayName} username={user?.username} src={user?.profile?.avatar_url} size="xs" />
        <span className="hidden max-w-[9rem] truncate text-xs font-semibold text-ink sm:block">
          {displayName}
        </span>
        <ChevronDown className="h-3 w-3 text-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-md animate-fade-in"
        >
          <div className="border-b border-line-subtle px-2.5 py-2">
            <p className="truncate text-xs font-bold text-ink">{displayName}</p>
            <p className="truncate text-[11px] text-muted">{user?.email}</p>
          </div>
          <MenuLink to="/dashboard" icon={LayoutDashboard} onClick={() => setOpen(false)}>
            Dashboard
          </MenuLink>
          <MenuLink to="/organizations" icon={Building2} onClick={() => setOpen(false)}>
            Organizations
          </MenuLink>
          <MenuLink to="/notifications" icon={Bell} onClick={() => setOpen(false)}>
            Notifications
          </MenuLink>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-800 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  icon: Icon,
  children,
  onClick,
}: {
  to: string;
  icon: typeof Bell;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-taupe transition-colors hover:bg-canvas hover:text-ink"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Link>
  );
}
