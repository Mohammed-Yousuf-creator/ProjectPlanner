import type {
  EventRead,
  SponsorshipListingRead,
  SponsorshipNegotiationMessageRead,
  SponsorshipProposalRead,
  UserMeResponse,
} from '@/api/types';

/**
 * Typed builders for test fixtures.
 *
 * They mirror the generated schema closely enough that a breaking API change
 * surfaces as a TypeScript error here instead of a silent test pass.
 */

export function makeUser(overrides: Partial<UserMeResponse> = {}): UserMeResponse {
  return {
    id: 'user-1',
    email: 'ada@example.com',
    username: 'ada',
    is_active: true,
    is_superuser: false,
    roles: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    profile: null,
    ...overrides,
  } as UserMeResponse;
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * Timing defaults are relative to "now" so the fixture stays in an open
 * registration window no matter when the suite runs.
 */
const BASE_EVENT = {
  id: 'event-1',
  organization_id: 'org-1',
  name: 'Winter Build Sprint',
  slug: 'winter-build-sprint',
  short_description: 'A 48-hour build sprint.',
  description: 'Build something useful.',
  event_type: 'hackathon',
  format: 'offline',
  visibility: 'public',
  status: 'published',
  timezone: 'Asia/Kolkata',
  starts_at: daysFromNow(30),
  ends_at: daysFromNow(32),
  registration_opens_at: daysFromNow(-10),
  registration_closes_at: daysFromNow(20),
  submission_deadline_at: daysFromNow(31),
  venue_name: 'Innovation Hall',
  address: '12 MG Road',
  city: 'Pune',
  country: 'India',
  min_team_size: 2,
  max_team_size: 4,
  is_registration_open: true,
  created_by_user_id: 'user-1',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  organization_name: 'Acme Collective',
} as const;

export function makeEvent(overrides: Partial<EventRead> = {}): EventRead {
  return { ...BASE_EVENT, ...overrides } as EventRead;
}

export function makeListing(
  overrides: Partial<SponsorshipListingRead> = {},
): SponsorshipListingRead {
  return {
    id: 'listing-1',
    owner_organization_id: 'org-listing-owner',
    owner_organization_name: 'Listing Owner Org',
    event_id: null,
    event_name: null,
    event_title: null,
    listing_type: 'seeking_sponsors',
    title: 'Title sponsor wanted',
    description: 'We need a title sponsor for the sprint.',
    audience_description: '500 student developers',
    benefits: ['Logo on site'],
    min_budget: '50000.00',
    max_budget: '150000.00',
    currency: 'INR',
    status: 'published',
    expires_at: null,
    created_by_user_id: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    packages: [],
    ...overrides,
  } as SponsorshipListingRead;
}

export function makeNegotiationMessage(
  overrides: Partial<SponsorshipNegotiationMessageRead> = {},
): SponsorshipNegotiationMessageRead {
  return {
    id: 'message-1',
    proposal_id: 'proposal-1',
    author_organization_id: 'org-listing-owner',
    author_organization_name: 'Listing Owner Org',
    author_user_id: 'user-2',
    author_user_name: 'Grace',
    message_type: 'message',
    message: 'Thanks for the proposal.',
    counter_amount: null,
    currency: 'INR',
    created_at: '2026-10-02T00:00:00Z',
    ...overrides,
  } as SponsorshipNegotiationMessageRead;
}

export function makeProposal(
  overrides: Partial<SponsorshipProposalRead> = {},
): SponsorshipProposalRead {
  return {
    id: 'proposal-1',
    listing_id: 'listing-1',
    listing_title: 'Title sponsor wanted',
    listing: null,
    proposer_organization_id: 'org-proposer',
    proposer_organization_name: 'Proposer Org',
    listing_owner_organization_id: 'org-listing-owner',
    listing_owner_organization_name: 'Listing Owner Org',
    target_event_id: 'event-1',
    target_event_name: 'Winter Build Sprint',
    target_event_title: null,
    package_id: null,
    package_name: null,
    created_by_user_id: 'user-3',
    proposed_amount: '75000.00',
    currency: 'INR',
    proposed_benefits: null,
    message: 'We would like to sponsor the sprint.',
    status: 'pending',
    responded_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    negotiation_messages: [],
    ...overrides,
  } as SponsorshipProposalRead;
}
