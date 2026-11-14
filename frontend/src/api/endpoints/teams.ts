import { cleanParams, request } from '../client';
import type {
  TeamCreateRequest,
  TeamCreatedResponse,
  TeamDetailRead,
  TeamDiscoveryItem,
  TeamInvitationRead,
  TeamInviteCreateRequest,
  TeamJoinRequest,
  TeamMemberRead,
  TeamMemberRoleUpdateRequest,
  TeamTransferOwnershipRequest,
} from '../types';

export type TeamListParams = { limit?: number; offset?: number };

export function createTeam(eventId: string, body: TeamCreateRequest): Promise<TeamCreatedResponse> {
  return request.post<TeamCreatedResponse>(`/events/${eventId}/teams`, body);
}

/** GET /events/{id}/teams - registered/approved participants only (403 otherwise). */
export function getEventTeams(
  eventId: string,
  params: TeamListParams = {},
): Promise<TeamDiscoveryItem[]> {
  return request.get<TeamDiscoveryItem[]>(`/events/${eventId}/teams`, {
    params: cleanParams(params),
  });
}

export function getTeam(teamId: string): Promise<TeamDetailRead> {
  return request.get<TeamDetailRead>(`/teams/${teamId}`);
}

export function joinTeam(teamId: string, body: TeamJoinRequest): Promise<TeamMemberRead> {
  return request.post<TeamMemberRead>(`/teams/${teamId}/join`, body);
}

export function inviteToTeam(
  teamId: string,
  body: TeamInviteCreateRequest,
): Promise<TeamInvitationRead> {
  return request.post<TeamInvitationRead>(`/teams/${teamId}/invitations`, body);
}

export function acceptTeamInvitation(invitationId: string): Promise<TeamMemberRead> {
  return request.post<TeamMemberRead>(`/team-invitations/${invitationId}/accept`);
}

export function rejectTeamInvitation(invitationId: string): Promise<TeamInvitationRead> {
  return request.post<TeamInvitationRead>(`/team-invitations/${invitationId}/reject`);
}

export function leaveTeam(teamId: string): Promise<TeamMemberRead> {
  return request.post<TeamMemberRead>(`/teams/${teamId}/leave`);
}

export function removeTeamMember(teamId: string, userId: string): Promise<TeamMemberRead> {
  return request.delete<TeamMemberRead>(`/teams/${teamId}/members/${userId}`);
}

export function updateTeamMemberRole(
  teamId: string,
  userId: string,
  body: TeamMemberRoleUpdateRequest,
): Promise<TeamMemberRead> {
  return request.patch<TeamMemberRead>(`/teams/${teamId}/members/${userId}/role`, body);
}

export function transferTeamOwnership(
  teamId: string,
  body: TeamTransferOwnershipRequest,
): Promise<TeamMemberRead> {
  return request.post<TeamMemberRead>(`/teams/${teamId}/transfer-ownership`, body);
}

export function disbandTeam(teamId: string): Promise<TeamDetailRead> {
  return request.post<TeamDetailRead>(`/teams/${teamId}/disband`);
}
