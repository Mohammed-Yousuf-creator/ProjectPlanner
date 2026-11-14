import { request } from '../client';
import type {
  MentorRequestRead,
  ParticipantDashboardResponse,
  ParticipantRegisteredEventDetail,
  ParticipantRegistrationRead,
  TeamInvitationDetailRead,
} from '../types';

export function getParticipantDashboard(): Promise<ParticipantDashboardResponse> {
  return request.get<ParticipantDashboardResponse>('/participants/me/dashboard');
}

export function getMyRegistrations(): Promise<ParticipantRegistrationRead[]> {
  return request.get<ParticipantRegistrationRead[]>('/participants/me/registrations');
}

export function getMyRegisteredEvent(eventId: string): Promise<ParticipantRegisteredEventDetail> {
  return request.get<ParticipantRegisteredEventDetail>(`/participants/me/events/${eventId}`);
}

export function getMyTeamInvitations(): Promise<TeamInvitationDetailRead[]> {
  return request.get<TeamInvitationDetailRead[]>('/participants/me/team-invitations');
}

export function getMyMentorRequests(eventId?: string): Promise<MentorRequestRead[]> {
  return request.get<MentorRequestRead[]>('/participants/me/mentor-requests', {
    params: eventId ? { event_id: eventId } : undefined,
  });
}
