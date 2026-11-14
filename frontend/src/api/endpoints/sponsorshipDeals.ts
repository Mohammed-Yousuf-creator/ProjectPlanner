import { cleanParams, request } from '../client';
import type {
  SponsorshipDealRead,
  SponsorshipDealStatusUpdate,
  SponsorshipDeliverableRead,
} from '../types';

export function getOrganizationSponsorshipDeals(
  organizationId: string,
  params: { status?: string; event_id?: string; limit?: number; offset?: number } = {},
): Promise<SponsorshipDealRead[]> {
  return request.get<SponsorshipDealRead[]>(`/organizations/${organizationId}/sponsorship-deals`, {
    params: cleanParams(params),
  });
}

export function getSponsorshipDeal(dealId: string): Promise<SponsorshipDealRead> {
  return request.get<SponsorshipDealRead>(`/sponsorship-deals/${dealId}`);
}

/** Only active -> completed|cancelled is permitted; reopening is rejected. */
export function updateSponsorshipDealStatus(
  dealId: string,
  body: SponsorshipDealStatusUpdate,
): Promise<SponsorshipDealRead> {
  return request.patch<SponsorshipDealRead>(`/sponsorship-deals/${dealId}/status`, body);
}

export function getDealDeliverables(dealId: string): Promise<SponsorshipDeliverableRead[]> {
  return request.get<SponsorshipDeliverableRead[]>(`/sponsorship-deals/${dealId}/deliverables`);
}
