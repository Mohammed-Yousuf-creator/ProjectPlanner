import type {
  OrganizationWithMyRoleRead,
  TeamMemberInfo,
  TeamDetailRead,
  UserMeResponse,
} from '@/api/types';

/** Owner or admin of an organization - the only roles allowed to mutate. */
export function canManageOrganization(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function isOrganizationOwner(role: string | null | undefined): boolean {
  return role === 'owner';
}

export function findMyOrganizationRole(
  organizations: OrganizationWithMyRoleRead[] | undefined,
  organizationId: string | null | undefined,
): string | null {
  if (!organizations || !organizationId) return null;
  const match = organizations.find((org) => org.id === organizationId);
  return match?.my_role ?? null;
}

/** The team roster is only populated for active members (members: null otherwise). */
export function myTeamMembership(
  team: TeamDetailRead | undefined,
  userId: string | null | undefined,
): TeamMemberInfo | null {
  if (!team?.members || !userId) return null;
  return (
    team.members.find((member) => member.user_id === userId && member.status === 'active') ?? null
  );
}

export function canManageTeam(member: TeamMemberInfo | null): boolean {
  return member?.role === 'owner' || member?.role === 'lead';
}

export function isTeamOwner(member: TeamMemberInfo | null): boolean {
  return member?.role === 'owner';
}

/** Creator, owner or lead may edit task details / delete tasks. */
export function canEditTask(
  taskCreatedBy: string | undefined,
  currentUserId: string | undefined,
  member: TeamMemberInfo | null,
): boolean {
  if (!currentUserId) return false;
  if (taskCreatedBy === currentUserId) return true;
  return canManageTeam(member);
}

/** `UserMeResponse.profile.display_name` is the canonical display name. */
export function displayNameOf(user: UserMeResponse | null | undefined): string {
  return user?.profile?.display_name?.trim() || user?.username || '';
}
