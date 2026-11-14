import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeSponsorshipListing,
  createSponsorshipListing,
  createSponsorshipPackage,
  deleteSponsorshipPackage,
  getOrganizationSponsorshipListings,
  getSponsorshipListing,
  getSponsorshipListings,
  getSponsorshipPackages,
  publishSponsorshipListing,
  updateSponsorshipListing,
  updateSponsorshipPackage,
  type SponsorshipListingListParams,
} from '@/api/endpoints/sponsorshipListings';
import {
  acceptSponsorshipProposal,
  addNegotiationMessage,
  createSponsorshipProposal,
  getOrganizationSponsorshipProposals,
  getSponsorshipProposal,
  rejectSponsorshipProposal,
  withdrawSponsorshipProposal,
} from '@/api/endpoints/sponsorshipProposals';
import {
  getOrganizationSponsorshipDeals,
  getSponsorshipDeal,
  updateSponsorshipDealStatus,
} from '@/api/endpoints/sponsorshipDeals';
import { createDeliverable, listDeliverables, updateDeliverable } from '@/api/endpoints/sponsorshipDeliverables';
import { getSponsors, type SponsorListParams } from '@/api/endpoints/sponsors';
import type {
  SponsorshipDealStatusUpdate,
  SponsorshipDeliverableCreate,
  SponsorshipDeliverableUpdate,
  SponsorshipListingCreate,
  SponsorshipListingUpdate,
  SponsorshipNegotiationMessageCreate,
  SponsorshipPackageCreate,
  SponsorshipPackageUpdate,
  SponsorshipProposalCreate,
} from '@/api/types';

export const sponsorKeys = {
  directory: (params: SponsorListParams) => ['sponsors', params] as const,
  listings: (params: SponsorshipListingListParams) => ['sponsorship-listings', params] as const,
  listing: (listingId: string) => ['sponsorship-listings', 'detail', listingId] as const,
  packages: (listingId: string) => ['sponsorship-listings', listingId, 'packages'] as const,
  orgListings: (orgId: string) => ['organizations', orgId, 'sponsorship-listings'] as const,
  orgProposals: (orgId: string, params: Record<string, unknown>) =>
    ['organizations', orgId, 'sponsorship-proposals', params] as const,
  proposal: (proposalId: string) => ['sponsorship-proposals', proposalId] as const,
  orgDeals: (orgId: string, params: Record<string, unknown>) =>
    ['organizations', orgId, 'sponsorship-deals', params] as const,
  deal: (dealId: string) => ['sponsorship-deals', dealId] as const,
  deliverables: (dealId: string) => ['sponsorship-deals', dealId, 'deliverables'] as const,
};

/* ------------------------------- discovery ------------------------------- */

export function useSponsors(params: SponsorListParams = {}) {
  return useQuery({
    queryKey: sponsorKeys.directory(params),
    queryFn: () => getSponsors(params),
    retry: 0,
  });
}

export function useSponsorshipListings(params: SponsorshipListingListParams = {}) {
  return useQuery({
    queryKey: sponsorKeys.listings(params),
    queryFn: () => getSponsorshipListings(params),
    retry: 0,
  });
}

export function useSponsorshipListing(listingId: string | undefined) {
  return useQuery({
    queryKey: sponsorKeys.listing(listingId ?? ''),
    queryFn: () => getSponsorshipListing(listingId as string),
    enabled: Boolean(listingId),
    retry: 0,
  });
}

/* --------------------------- organization side --------------------------- */

export function useOrgSponsorshipListings(orgId: string | undefined) {
  return useQuery({
    queryKey: sponsorKeys.orgListings(orgId ?? ''),
    queryFn: () => getOrganizationSponsorshipListings(orgId as string),
    enabled: Boolean(orgId),
    retry: 0,
  });
}

export function useCreateSponsorshipListing(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SponsorshipListingCreate) => createSponsorshipListing(orgId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.orgListings(orgId) });
      void queryClient.invalidateQueries({ queryKey: ['sponsorship-listings'] });
    },
  });
}

export function useUpdateSponsorshipListing(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, body }: { listingId: string; body: SponsorshipListingUpdate }) =>
      updateSponsorshipListing(listingId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.orgListings(orgId) });
    },
  });
}

export function useSponsorshipListingAction(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, action }: { listingId: string; action: 'publish' | 'close' }) =>
      action === 'publish'
        ? publishSponsorshipListing(listingId)
        : closeSponsorshipListing(listingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.orgListings(orgId) });
      void queryClient.invalidateQueries({ queryKey: ['sponsorship-listings'] });
    },
  });
}

export function useSponsorshipPackages(listingId: string | undefined) {
  return useQuery({
    queryKey: sponsorKeys.packages(listingId ?? ''),
    queryFn: () => getSponsorshipPackages(listingId as string),
    enabled: Boolean(listingId),
    retry: 0,
  });
}

export function useCreatePackage(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, body }: { listingId: string; body: SponsorshipPackageCreate }) =>
      createSponsorshipPackage(listingId, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.packages(variables.listingId) });
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.orgListings(orgId) });
    },
  });
}

export function useUpdatePackage(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId, body }: {
      packageId: string;
      body: SponsorshipPackageUpdate;
      listingId: string;
    }) => updateSponsorshipPackage(packageId, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.packages(variables.listingId) });
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.orgListings(orgId) });
    },
  });
}

export function useDeletePackage(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId }: { packageId: string; listingId: string }) =>
      deleteSponsorshipPackage(packageId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.packages(variables.listingId) });
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.orgListings(orgId) });
    },
  });
}

/* ------------------------------- proposals ------------------------------- */

export function useOrgSponsorshipProposals(
  orgId: string | undefined,
  params: { direction?: 'incoming' | 'outgoing'; status?: string } = {},
) {
  return useQuery({
    queryKey: sponsorKeys.orgProposals(orgId ?? '', params),
    queryFn: () => getOrganizationSponsorshipProposals(orgId as string, params),
    enabled: Boolean(orgId),
    retry: 0,
  });
}

export function useSponsorshipProposal(proposalId: string | undefined) {
  return useQuery({
    queryKey: sponsorKeys.proposal(proposalId ?? ''),
    queryFn: () => getSponsorshipProposal(proposalId as string),
    enabled: Boolean(proposalId),
    retry: 0,
  });
}

export function useCreateProposal(listingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SponsorshipProposalCreate) => createSponsorshipProposal(listingId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.listing(listingId) });
    },
  });
}

export function useAddNegotiationMessage(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SponsorshipNegotiationMessageCreate) =>
      addNegotiationMessage(proposalId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.proposal(proposalId) });
    },
  });
}

export function useProposalDecision(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'accept' | 'reject' | 'withdraw') => {
      if (action === 'accept') return acceptSponsorshipProposal(proposalId);
      if (action === 'reject') return rejectSponsorshipProposal(proposalId);
      return withdrawSponsorshipProposal(proposalId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.proposal(proposalId) });
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

/* --------------------------------- deals --------------------------------- */

export function useOrgSponsorshipDeals(
  orgId: string | undefined,
  params: { status?: string; event_id?: string; limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: sponsorKeys.orgDeals(orgId ?? '', params),
    queryFn: () => getOrganizationSponsorshipDeals(orgId as string, params),
    enabled: Boolean(orgId),
    retry: 0,
  });
}

export function useSponsorshipDeal(dealId: string | undefined) {
  return useQuery({
    queryKey: sponsorKeys.deal(dealId ?? ''),
    queryFn: () => getSponsorshipDeal(dealId as string),
    enabled: Boolean(dealId),
    retry: 0,
  });
}

export function useDealDeliverables(dealId: string | undefined) {
  return useQuery({
    queryKey: sponsorKeys.deliverables(dealId ?? ''),
    queryFn: () => listDeliverables(dealId as string),
    enabled: Boolean(dealId),
    retry: 0,
  });
}

export function useUpdateDealStatus(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SponsorshipDealStatusUpdate) => updateSponsorshipDealStatus(dealId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.deal(dealId) });
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useCreateDeliverable(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SponsorshipDeliverableCreate) => createDeliverable(dealId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.deliverables(dealId) });
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.deal(dealId) });
    },
  });
}

export function useUpdateDeliverable(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deliverableId,
      body,
    }: {
      deliverableId: string;
      body: SponsorshipDeliverableUpdate;
    }) => updateDeliverable(deliverableId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.deliverables(dealId) });
      void queryClient.invalidateQueries({ queryKey: sponsorKeys.deal(dealId) });
    },
  });
}
