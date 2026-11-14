import { cleanParams, request } from '../client';
import type {
  SponsorshipDealRead,
  SponsorshipNegotiationMessageCreate,
  SponsorshipNegotiationMessageRead,
  SponsorshipProposalCreate,
  SponsorshipProposalRead,
} from '../types';

export function createSponsorshipProposal(
  listingId: string,
  body: SponsorshipProposalCreate,
): Promise<SponsorshipProposalRead> {
  return request.post<SponsorshipProposalRead>(`/sponsorship-listings/${listingId}/proposals`, body);
}

export function getOrganizationSponsorshipProposals(
  organizationId: string,
  params: { direction?: 'incoming' | 'outgoing'; status?: string } = {},
): Promise<SponsorshipProposalRead[]> {
  return request.get<SponsorshipProposalRead[]>(
    `/organizations/${organizationId}/sponsorship-proposals`,
    { params: cleanParams(params) },
  );
}

export function getSponsorshipProposal(proposalId: string): Promise<SponsorshipProposalRead> {
  return request.get<SponsorshipProposalRead>(`/sponsorship-proposals/${proposalId}`);
}

export function addNegotiationMessage(
  proposalId: string,
  body: SponsorshipNegotiationMessageCreate,
): Promise<SponsorshipNegotiationMessageRead> {
  return request.post<SponsorshipNegotiationMessageRead>(
    `/sponsorship-proposals/${proposalId}/messages`,
    body,
  );
}

/** Accept returns the created immutable deal snapshot. */
export function acceptSponsorshipProposal(proposalId: string): Promise<SponsorshipDealRead> {
  return request.post<SponsorshipDealRead>(`/sponsorship-proposals/${proposalId}/accept`);
}

export function rejectSponsorshipProposal(proposalId: string): Promise<SponsorshipProposalRead> {
  return request.post<SponsorshipProposalRead>(`/sponsorship-proposals/${proposalId}/reject`);
}

export function withdrawSponsorshipProposal(proposalId: string): Promise<SponsorshipProposalRead> {
  return request.post<SponsorshipProposalRead>(`/sponsorship-proposals/${proposalId}/withdraw`);
}
