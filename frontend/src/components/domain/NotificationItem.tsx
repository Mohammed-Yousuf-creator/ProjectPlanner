import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatRelative, humanizeEnum } from '@/lib/format';
import type { NotificationRead } from '@/api/types';

/**
 * Deep links are derived only from reference ids present in `NotificationRead.data`
 * (see Backend_missing.md). When no target can be determined the row is rendered
 * without a link instead of pointing somewhere arbitrary.
 */
function resolveNotificationTarget(notification: NotificationRead): string | null {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const asString = (value: unknown) => (typeof value === 'string' ? value : null);

  const proposalId = asString(data.proposal_id);
  const dealId = asString(data.deal_id);
  if (dealId) return `/sponsorship/deals/${dealId}`;
  if (proposalId) return `/sponsorship/proposals/${proposalId}`;
  return null;
}

export function NotificationItem({
  notification,
  onMarkRead,
  marking,
}: {
  notification: NotificationRead;
  onMarkRead: (id: string) => void;
  marking: boolean;
}) {
  const unread = notification.read_at === null;
  const target = resolveNotificationTarget(notification);

  const content = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {humanizeEnum(notification.notification_type)}
        </span>
        <span className="text-[10px] text-muted">·</span>
        <span className="text-[11px] text-taupe">{formatRelative(notification.created_at)}</span>
        {unread && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-800">
            Unread
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-ink">{notification.title}</p>
      <p className="text-[11px] leading-relaxed text-taupe">{notification.body}</p>
    </div>
  );

  return (
    <div
      className={
        'flex items-start gap-3 rounded-xl border p-3.5 transition-colors ' +
        (unread ? 'border-line bg-white' : 'border-line-subtle bg-canvas-2')
      }
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-taupe">
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {target ? (
          <Link to={target} className="block rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-forest">
            {content}
          </Link>
        ) : (
          content
        )}
      </div>
      {unread && (
        <Button
          variant="outline"
          size="sm"
          loading={marking}
          onClick={() => onMarkRead(notification.id)}
          icon={<Check className="h-3 w-3" aria-hidden="true" />}
        >
          Mark read
        </Button>
      )}
    </div>
  );
}
