import { describe, expect, it } from 'vitest';
import { resolveNotificationTarget } from '@/lib/notificationTarget';
import type { NotificationRead } from '@/api/types';

/**
 * Backend_missing.md #7: every notification type must resolve to a coherent
 * destination, and nothing may resolve to a made-up route. Each case below
 * mirrors a `create_notification` / `notify_org_admins` call in the backend.
 */

function notification(overrides: Partial<NotificationRead> = {}): NotificationRead {
  return {
    id: 'notif-1',
    user_id: 'user-1',
    event_id: null,
    notification_type: 'announcement',
    title: 'Title',
    body: 'Body',
    data: null,
    read_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as NotificationRead;
}

describe('resolveNotificationTarget', () => {
  it('prefers the deal over the proposal', () => {
    expect(
      resolveNotificationTarget(
        notification({
          notification_type: 'sponsorship_deal_status_updated',
          data: { deal_id: 'deal-1', proposal_id: 'proposal-1' },
        }),
      ),
    ).toBe('/sponsorship/deals/deal-1');
  });

  it('links proposal-scoped notifications', () => {
    for (const type of [
      'sponsorship_proposal_received',
      'sponsorship_proposal_accepted',
      'sponsorship_proposal_rejected',
      'sponsorship_proposal_withdrawn',
      'sponsorship_negotiation_message_received',
    ]) {
      expect(
        resolveNotificationTarget(notification({ notification_type: type, data: { proposal_id: 'p-9' } })),
      ).toBe('/sponsorship/proposals/p-9');
    }
  });

  it('links deliverable notifications through their deal', () => {
    expect(
      resolveNotificationTarget(
        notification({
          notification_type: 'sponsorship_deliverable_assigned',
          data: { deal_id: 'deal-7', deliverable_id: 'd-1' },
        }),
      ),
    ).toBe('/sponsorship/deals/deal-7');
  });

  it('links mentor notifications to the mentor request list', () => {
    for (const type of ['mentor_request_assigned', 'mentor_request_status_updated']) {
      expect(
        resolveNotificationTarget(
          notification({ notification_type: type, data: { mentor_request_id: 'mr-1', status: 'assigned' } }),
        ),
      ).toBe('/my/mentor-requests');
    }
  });

  it('links announcements to the event announcement board', () => {
    expect(
      resolveNotificationTarget(
        notification({
          notification_type: 'announcement',
          event_id: 'event-1',
          data: { event_id: 'event-1' },
        }),
      ),
    ).toBe('/events/event-1/announcements');
  });

  it('falls back to the event detail page for an unknown type with an event id', () => {
    expect(
      resolveNotificationTarget(
        notification({
          notification_type: 'something_new',
          event_id: 'event-2',
          data: null,
        }),
      ),
    ).toBe('/my/events/event-2');
  });

  it('reads event_id from data when the column is empty', () => {
    expect(
      resolveNotificationTarget(
        notification({
          notification_type: 'announcement',
          event_id: null,
          data: { event_id: 'event-3' },
        }),
      ),
    ).toBe('/events/event-3/announcements');
  });

  it('returns null when there is nothing to link to', () => {
    expect(resolveNotificationTarget(notification({ notification_type: 'unknown', data: null }))).toBeNull();
  });

  it('ignores non-string and empty reference ids', () => {
    expect(
      resolveNotificationTarget(
        notification({
          notification_type: 'sponsorship_deal_status_updated',
          data: { deal_id: '', proposal_id: 42 },
        }),
      ),
    ).toBeNull();
  });
});
