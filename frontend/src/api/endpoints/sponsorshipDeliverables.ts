import { request } from '../client';
import type {
  SponsorshipDeliverableCreate,
  SponsorshipDeliverableRead,
  SponsorshipDeliverableUpdate,
} from '../types';

export function createDeliverable(
  dealId: string,
  body: SponsorshipDeliverableCreate,
): Promise<SponsorshipDeliverableRead> {
  return request.post<SponsorshipDeliverableRead>(
    `/sponsorship-deals/${dealId}/deliverables`,
    body,
  );
}

export function listDeliverables(dealId: string): Promise<SponsorshipDeliverableRead[]> {
  return request.get<SponsorshipDeliverableRead[]>(`/sponsorship-deals/${dealId}/deliverables`);
}

export function updateDeliverable(
  deliverableId: string,
  body: SponsorshipDeliverableUpdate,
): Promise<SponsorshipDeliverableRead> {
  return request.patch<SponsorshipDeliverableRead>(
    `/sponsorship-deliverables/${deliverableId}`,
    body,
  );
}
