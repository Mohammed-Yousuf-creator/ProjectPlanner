import { cleanParams, request } from '../client';
import type { SponsorDiscoveryRead } from '../types';

export type SponsorListParams = {
  query?: string;
  currency?: string;
  min_budget?: number;
  max_budget?: number;
  limit?: number;
  offset?: number;
};

/** GET /sponsors - public sponsor directory. */
export function getSponsors(params: SponsorListParams = {}): Promise<SponsorDiscoveryRead[]> {
  return request.get<SponsorDiscoveryRead[]>('/sponsors', { params: cleanParams(params) });
}
