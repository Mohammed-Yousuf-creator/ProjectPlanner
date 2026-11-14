import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { PageNumberPagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { NotificationItem } from '@/components/domain/NotificationItem';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications';
import { toApiError } from '@/lib/errors';
import { TABLE_PAGE_SIZE } from '@/lib/constants';

export function NotificationsPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const list = useNotifications({ page, page_size: TABLE_PAGE_SIZE, unread_only: unreadOnly });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="In-app notifications from organizers, teams, and sponsorship activity."
        actions={
          <>
            <Button
              variant={unreadOnly ? 'primary' : 'chip'}
              onClick={() => {
                setUnreadOnly((value) => !value);
                setPage(1);
              }}
            >
              {unreadOnly ? 'Showing unread' : 'Show unread only'}
            </Button>
            <Button
              variant="outline"
              loading={markAll.isPending}
              icon={<CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() =>
                markAll.mutate(undefined, {
                  onSuccess: () => toast.success('All notifications marked read.'),
                  onError: (error) => toast.error(toApiError(error).message),
                })
              }
            >
              Mark all read
            </Button>
          </>
        }
      />

      <Card className="space-y-3">
        <CardHeader
          title={unreadOnly ? 'Unread notifications' : 'All notifications'}
          description="Newest first. A notification can only be read by its recipient."
        />

        {list.isLoading ? (
          <SkeletonLines lines={6} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data || list.data.length === 0 ? (
          <EmptyState
            inline
            icon={Bell}
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            description={
              unreadOnly
                ? 'You are all caught up.'
                : 'Announcements, mentor updates, and sponsorship activity will appear here.'
            }
          />
        ) : (
          <div className="space-y-2">
            {list.data.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                marking={markRead.isPending}
                onMarkRead={(id) =>
                  markRead.mutate(id, {
                    onSuccess: () => toast.success('Marked as read.'),
                    onError: (error) => toast.error(toApiError(error).message),
                  })
                }
              />
            ))}
          </div>
        )}

        {list.data && list.data.length > 0 && (
          <PageNumberPagination
            page={page}
            pageSize={TABLE_PAGE_SIZE}
            pageItemCount={list.data.length}
            onChange={setPage}
            disabled={list.isFetching}
          />
        )}
      </Card>
    </div>
  );
}
