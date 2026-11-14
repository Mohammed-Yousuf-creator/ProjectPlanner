import type { NotificationRead } from '@/api/types';

/**
 * Deep links, derived ONLY from reference ids the backend puts in
 * `NotificationRead.data`. When no target can be determined the row renders
 * without a link rather than pointing somewhere arbitrary.
 *
 * The ordering below is significant: the most specific target wins. A deal
 * beats a proposal (an accepted proposal has both), and an event-scoped page
 * beats the generic event page.
 */
export function resolveNotificationTarget(notification: NotificationRead): string | null {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const id = (key: string) => {
    const value = data[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  // Sponsorship: deal → proposal (messages, deliverables, status changes).
  const dealId = id('deal_id');
  const proposalId = id('proposal_id');
  if (dealId) return `/sponsorship/deals/${dealId}`;
  if (proposalId) return `/sponsorship/proposals/${proposalId}`;

  // Event operations.
  const mentorRequestId = id('mentor_request_id');
  if (mentorRequestId) return '/my/mentor-requests';

  const eventId = id('event_id') ?? notification.event_id ?? null;
  if (!eventId) return null;

  switch (notification.notification_type) {
    case 'announcement':
      return `/events/${eventId}/announcements`;
    case 'mentor_request_assigned':
    case 'mentor_request_status_updated':
      return `/events/${eventId}/mentor`;
    default:
      // Unknown type but a usable event id: land on the event detail page,
      // which is always a coherent place to continue from.
      return `/my/events/${eventId}`;
  }
}
