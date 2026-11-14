/**
 * Enum values mirrored from the backend's OpenAPI schema and README so that the
 * UI never invents an option the server would reject.
 */

export const EVENT_FORMATS = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
] as const;

export const EVENT_VISIBILITIES = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'unlisted', label: 'Unlisted' },
] as const;

/**
 * `event_type` is a free-text string on the backend (max 50 chars), not an enum.
 * These are suggested values only - the field stays editable.
 */
export const EVENT_TYPE_SUGGESTIONS = [
  'hackathon',
  'conference',
  'workshop',
  'meetup',
  'competition',
  'bootcamp',
] as const;

export const ORGANIZATION_TYPES = [
  { value: 'organizer', label: 'Organizer' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'both', label: 'Organizer & sponsor' },
  { value: 'other', label: 'Other' },
] as const;

export const REGISTRATION_STATUSES = [
  'registered',
  'approved',
  'waitlisted',
  'rejected',
  'withdrawn',
] as const;

export const PARTICIPANT_STATUS_OPTIONS = [
  { value: 'approved', label: 'Approve' },
  { value: 'waitlisted', label: 'Waitlist' },
  { value: 'rejected', label: 'Reject' },
] as const;

export const TEAM_ROLES = ['owner', 'lead', 'member'] as const;
export const TEAM_STATUSES = ['forming', 'active', 'submitted', 'disbanded'] as const;

export const TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'In review' },
  { value: 'done', label: 'Done' },
] as const;

export const TASK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;

export const MENTOR_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
] as const;

export const ANNOUNCEMENT_AUDIENCES = [
  { value: 'all', label: 'Everyone' },
  { value: 'participants', label: 'Participants' },
  { value: 'judges', label: 'Judges' },
  { value: 'mentors', label: 'Mentors' },
  { value: 'team', label: 'One team' },
] as const;

export const MENTOR_REQUEST_STATUSES = [
  'pending',
  'assigned',
  'in_progress',
  'resolved',
  'cancelled',
  'rejected',
] as const;

export const LISTING_TYPES = [
  { value: 'seeking_sponsors', label: 'Seeking sponsors' },
  { value: 'offering_sponsorship', label: 'Offering sponsorship' },
] as const;

export const PROPOSAL_STATUSES = [
  'pending',
  'negotiating',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
] as const;

export const DEAL_STATUSES = ['active', 'completed', 'cancelled'] as const;

export const DELIVERABLE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

/** Pagination defaults; kept small because the API caps limits at 100. */
export const DEFAULT_PAGE_SIZE = 12;
export const TABLE_PAGE_SIZE = 20;
