import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptOrganizationInvitation,
  createOrganization,
  createOrganizationEvent,
  getMyOrganizations,
  getOrganization,
  getOrganizationEvents,
  getOrganizationMembers,
  inviteOrganizationMember,
  rejectOrganizationInvitation,
  removeOrganizationMember,
  updateOrganization,
} from '@/api/endpoints/organizations';
import type {
  EventCreate,
  OrganizationCreate,
  OrganizationInviteRequest,
  OrganizationUpdate,
} from '@/api/types';

export const organizationKeys = {
  all: ['organizations'] as const,
  mine: ['organizations', 'mine'] as const,
  detail: (orgId: string) => ['organizations', 'detail', orgId] as const,
  members: (orgId: string) => ['organizations', orgId, 'members'] as const,
  events: (orgId: string) => ['organizations', orgId, 'events'] as const,
};

export function useMyOrganizations() {
  return useQuery({
    queryKey: organizationKeys.mine,
    queryFn: getMyOrganizations,
    staleTime: 60_000,
  });
}

export function useOrganization(orgId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.detail(orgId ?? ''),
    queryFn: () => getOrganization(orgId as string),
    enabled: Boolean(orgId),
  });
}

export function useOrganizationMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.members(orgId ?? ''),
    queryFn: () => getOrganizationMembers(orgId as string),
    enabled: Boolean(orgId),
  });
}

export function useOrganizationEvents(orgId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.events(orgId ?? ''),
    queryFn: () => getOrganizationEvents(orgId as string),
    enabled: Boolean(orgId),
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationCreate) => createOrganization(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.mine });
    },
  });
}

export function useUpdateOrganization(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationUpdate) => updateOrganization(orgId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(orgId) });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.mine });
    },
  });
}

export function useInviteOrganizationMember(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationInviteRequest) => inviteOrganizationMember(orgId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(orgId) });
    },
  });
}

export function useRespondToOrganizationInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      membershipId,
      action,
    }: {
      orgId: string;
      membershipId: string;
      action: 'accept' | 'reject';
    }) =>
      action === 'accept'
        ? acceptOrganizationInvitation(orgId, membershipId)
        : rejectOrganizationInvitation(orgId, membershipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.mine });
    },
  });
}

export function useRemoveOrganizationMember(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(orgId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(orgId) });
    },
  });
}

export function useCreateOrganizationEvent(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EventCreate) => createOrganizationEvent(orgId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.events(orgId) });
    },
  });
}
