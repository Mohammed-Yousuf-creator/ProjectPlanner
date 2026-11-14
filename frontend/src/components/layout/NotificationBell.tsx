import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';

/**
 * Recipe 5.1 right-hand action. Polls the unread count every 30s (no
 * notification WebSocket exists on the backend) and pauses while the tab is
 * hidden - the hook handles both.
 */
export function NotificationBell() {
  const { data } = useUnreadNotificationCount();
  const unread = data?.unread_count ?? 0;

  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-taupe transition-colors hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
    >
      <Bell className="h-4 w-4" aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-lg border border-line bg-rust px-1 text-center font-mono text-[10px] font-bold leading-[1.05rem] text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
