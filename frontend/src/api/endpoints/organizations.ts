import { request } from '../client';
import type {
  EventCreate,
  EventRead,
  OrganizationCreate,
  OrganizationInviteRequest,
  OrganizationMemberDetailRead,
  OrganizationMemberRead,
  OrganizationRead,
  OrganizationUpdate,
  OrganizationWithMyRoleRead,
} from '../types';

export function createOrganization(body: OrganizationCreate): Promise<OrganizationRead> {
  return request.post<OrganizationRead>('/organizations', body);
}

export function getMyOrganizations(): Promise<OrganizationWithMyRoleRead[]> {
  return request.get<OrganizationWithMyRoleRead[]>('/organizations/mine');
}

export function getOrganization(organizationId: string): Promise<OrganizationRead> {
  return request.get<OrganizationRead>(`/organizations/${organizationId}`);
}

export function updateOrganization(
  organizationId: string,
  body: OrganizationUpdate,
): Promise<OrganizationRead> {
  return request.patch<OrganizationRead>(`/organizations/${organizationId}`, body);
}

export function getOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMemberDetailRead[]> {
  return request.get<OrganizationMemberDetailRead[]>(`/organizations/${organizationId}/members`);
}

export function inviteOrganizationMember(
  organizationId: string,
  body: OrganizationInviteRequest,
): Promise<OrganizationMemberRead> {
  return request.post<OrganizationMemberRead>(
    `/organizations/${organizationId}/members/invitations`,
    body,
  );
}

export function acceptOrganizationInvitation(
  organizationId: string,
  membershipId: string,
): Promise<OrganizationMemberRead> {
  return request.post<OrganizationMemberRead>(
    `/organizations/${organizationId}/members/invitations/${membershipId}/accept`,
  );
}

export function rejectOrganizationInvitation(
  organizationId: string,
  membershipId: string,
): Promise<{ message: string }> {
  return request.post<{ message: string }>(
    `/organizations/${organizationId}/members/invitations/${membershipId}/reject`,
  );
}

export function removeOrganizationMember(
  organizationId: string,
  userId: string,
): Promise<{ message: string }> {
  return request.delete<{ message: string }>(`/organizations/${organizationId}/members/${userId}`);
}

export function createOrganizationEvent(
  organizationId: string,
  body: EventCreate,
): Promise<EventRead> {
  return request.post<EventRead>(`/organizations/${organizationId}/events`, body);
}

export function getOrganizationEvents(organizationId: string): Promise<EventRead[]> {
  return request.get<EventRead[]>(`/organizations/${organizationId}/events`);
}
