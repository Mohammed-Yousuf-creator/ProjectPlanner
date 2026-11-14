/**
 * Types re-exported from the OpenAPI-generated schema (src/api/schema.d.ts).
 *
 * Never hand-write an API interface anywhere in this codebase - import it from
 * here so that `npm run api:types` keeps the whole app honest.
 */
import type { components } from './schema';

type S = components['schemas'];

/* -------------------------------- auth ---------------------------------- */
export type RegisterRequest = S['RegisterRequest'];
export type LoginRequest = S['LoginRequest'];
export type AuthResponse = S['AuthResponse'];
export type TokenResponse = S['TokenResponse'];

/* -------------------------------- users --------------------------------- */
export type UserMeResponse = S['UserMeResponse'];
export type UserProfileRead = S['UserProfileRead'];

/* ---------------------------- organizations ----------------------------- */
export type OrganizationCreate = S['OrganizationCreate'];
export type OrganizationUpdate = S['OrganizationUpdate'];
export type OrganizationRead = S['OrganizationRead'];
export type OrganizationWithMyRoleRead = S['OrganizationWithMyRoleRead'];
export type OrganizationInviteRequest = S['OrganizationInviteRequest'];
export type OrganizationMemberRead = S['OrganizationMemberRead'];
export type OrganizationMemberDetailRead = S['OrganizationMemberDetailRead'];

/* -------------------------------- events -------------------------------- */
export type EventCreate = S['EventCreate'];
export type EventUpdate = S['EventUpdate'];
export type EventRead = S['EventRead'];
export type EventTrackCreate = S['EventTrackCreate'];
export type EventTrackUpdate = S['EventTrackUpdate'];
export type EventTrackRead = S['EventTrackRead'];

/* ---------------------------- registrations ----------------------------- */
export type EventRegisterRequest = S['EventRegisterRequest'];
export type EventRegistrationResponse = S['EventRegistrationResponse'];
export type OrganizerParticipantRead = S['OrganizerParticipantRead'];
export type ParticipantStatusUpdateRequest = S['ParticipantStatusUpdateRequest'];

/* ------------------------- participant dashboard ------------------------- */
export type ParticipantDashboardResponse = S['ParticipantDashboardResponse'];
export type ParticipantEventItem = S['ParticipantEventItem'];
export type ParticipantSummary = S['ParticipantSummary'];
export type ParticipantUserInfo = S['ParticipantUserInfo'];
export type ParticipantRegistrationRead = S['ParticipantRegistrationRead'];
export type ParticipantRegisteredEventDetail = S['ParticipantRegisteredEventDetail'];

/* --------------------------------- teams -------------------------------- */
export type TeamCreateRequest = S['TeamCreateRequest'];
export type TeamCreatedResponse = S['TeamCreatedResponse'];
export type TeamDiscoveryItem = S['TeamDiscoveryItem'];
export type TeamDetailRead = S['TeamDetailRead'];
export type TeamMemberInfo = S['TeamMemberInfo'];
export type TeamMemberRead = S['TeamMemberRead'];
export type TeamInviteCreateRequest = S['TeamInviteCreateRequest'];
export type TeamInvitationRead = S['TeamInvitationRead'];
export type TeamInvitationDetailRead = S['TeamInvitationDetailRead'];
export type TeamJoinRequest = S['TeamJoinRequest'];
export type TeamMemberRoleUpdateRequest = S['TeamMemberRoleUpdateRequest'];
export type TeamTransferOwnershipRequest = S['TeamTransferOwnershipRequest'];

/* -------------------------------- tasks --------------------------------- */
export type TeamTaskCreateRequest = S['TeamTaskCreateRequest'];
export type TeamTaskUpdateRequest = S['TeamTaskUpdateRequest'];
export type TeamTaskRead = S['TeamTaskRead'];
export type TeamTaskAssigneeRead = S['TeamTaskAssigneeRead'];
export type TeamTaskAssigneesUpdateRequest = S['TeamTaskAssigneesUpdateRequest'];

/* ------------------------------- messages ------------------------------- */
export type TeamMessageCreateRequest = S['TeamMessageCreateRequest'];
export type TeamMessageUpdateRequest = S['TeamMessageUpdateRequest'];
export type TeamMessageRead = S['TeamMessageRead'];

/* --------------------------------- files -------------------------------- */
export type StoredFileRead = S['StoredFileRead'];
/** Enriched file row for the team Files tab: uploader identity + message link. */
export type TeamFileRead = S['TeamFileRead'];
export type TeamFileListParams = { limit?: number; offset?: number };

/* -------------------------------- projects ------------------------------ */
export type ProjectCreate = S['ProjectCreate'];
export type ProjectDetailRead = S['ProjectDetailRead'];
export type ProjectPublicRead = S['ProjectPublicRead'];
export type ProjectSubmissionCreate = S['ProjectSubmissionCreate'];
export type ProjectSubmissionUpdate = S['ProjectSubmissionUpdate'];
export type ProjectSubmissionRead = S['ProjectSubmissionRead'];

/* -------------------------------- judging ------------------------------- */
export type JudgeCreate = S['JudgeCreate'];
export type JudgeRead = S['JudgeRead'];
export type JudgingCriteriaCreate = S['JudgingCriteriaCreate'];
export type JudgingCriteriaUpdate = S['JudgingCriteriaUpdate'];
export type JudgingCriteriaRead = S['JudgingCriteriaRead'];
export type EvaluationRead = S['EvaluationRead'];
export type EvaluationSaveRequest = S['EvaluationSaveRequest'];
export type EvaluationScoreItem = S['EvaluationScoreItem'];
export type EvaluationScoreRead = S['EvaluationScoreRead'];
export type LeaderboardEntryRead = S['LeaderboardEntryRead'];

/* ------------------------------- schedule ------------------------------- */
export type EventScheduleItemCreate = S['EventScheduleItemCreate'];
export type EventScheduleItemUpdate = S['EventScheduleItemUpdate'];
export type EventScheduleItemRead = S['EventScheduleItemRead'];

/* ----------------------------- announcements ---------------------------- */
export type AnnouncementCreate = S['AnnouncementCreate'];
export type AnnouncementUpdate = S['AnnouncementUpdate'];
export type AnnouncementRead = S['AnnouncementRead'];

/* ----------------------------- notifications ---------------------------- */
export type NotificationRead = S['NotificationRead'];
export type NotificationUnreadCountResponse = S['NotificationUnreadCountResponse'];

/* -------------------------------- check-in ------------------------------ */
export type CheckInAttendeeRead = S['CheckInAttendeeRead'];
export type CheckInSummaryRead = S['CheckInSummaryRead'];

/* ----------------------------- mentor requests -------------------------- */
export type MentorRequestCreate = S['MentorRequestCreate'];
export type MentorRequestAssign = S['MentorRequestAssign'];
export type MentorRequestStatusUpdate = S['MentorRequestStatusUpdate'];
export type MentorRequestRead = S['MentorRequestRead'];

/* ------------------------------ sponsorship ----------------------------- */
export type SponsorDiscoveryRead = S['SponsorDiscoveryRead'];
export type SponsorshipListingCreate = S['SponsorshipListingCreate'];
export type SponsorshipListingUpdate = S['SponsorshipListingUpdate'];
export type SponsorshipListingRead = S['SponsorshipListingRead'];
export type SponsorshipPackageCreate = S['SponsorshipPackageCreate'];
export type SponsorshipPackageUpdate = S['SponsorshipPackageUpdate'];
export type SponsorshipPackageRead = S['SponsorshipPackageRead'];
export type SponsorshipProposalCreate = S['SponsorshipProposalCreate'];
export type SponsorshipProposalRead = S['SponsorshipProposalRead'];
export type SponsorshipNegotiationMessageCreate = S['SponsorshipNegotiationMessageCreate'];
export type SponsorshipNegotiationMessageRead = S['SponsorshipNegotiationMessageRead'];
export type SponsorshipDealRead = S['SponsorshipDealRead'];
export type SponsorshipDealStatusUpdate = S['SponsorshipDealStatusUpdate'];
export type SponsorshipDeliverableCreate = S['SponsorshipDeliverableCreate'];
export type SponsorshipDeliverableUpdate = S['SponsorshipDeliverableUpdate'];
export type SponsorshipDeliverableRead = S['SponsorshipDeliverableRead'];
