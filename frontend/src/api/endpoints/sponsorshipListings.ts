import { cleanParams, request } from '../client';
import type {
  SponsorshipListingCreate,
  SponsorshipListingRead,
  SponsorshipListingUpdate,
  SponsorshipPackageCreate,
  SponsorshipPackageRead,
  SponsorshipPackageUpdate,
} from '../types';

export type SponsorshipListingListParams = {
  listing_type?: string;
  event_type?: string;
  city?: string;
  organization_name?: string;
  min_budget?: number;
  max_budget?: number;
  currency?: string;
  limit?: number;
  offset?: number;
};

export function getSponsorshipListings(
  params: SponsorshipListingListParams = {},
): Promise<SponsorshipListingRead[]> {
  return request.get<SponsorshipListingRead[]>('/sponsorship-listings', {
    params: cleanParams(params),
  });
}

export function getSponsorshipListing(listingId: string): Promise<SponsorshipListingRead> {
  return request.get<SponsorshipListingRead>(`/sponsorship-listings/${listingId}`);
}

export function createSponsorshipListing(
  organizationId: string,
  body: SponsorshipListingCreate,
): Promise<SponsorshipListingRead> {
  return request.post<SponsorshipListingRead>(
    `/organizations/${organizationId}/sponsorship-listings`,
    body,
  );
}

export function getOrganizationSponsorshipListings(
  organizationId: string,
): Promise<SponsorshipListingRead[]> {
  return request.get<SponsorshipListingRead[]>(
    `/organizations/${organizationId}/sponsorship-listings`,
  );
}

export function updateSponsorshipListing(
  listingId: string,
  body: SponsorshipListingUpdate,
): Promise<SponsorshipListingRead> {
  return request.patch<SponsorshipListingRead>(`/sponsorship-listings/${listingId}`, body);
}

export function publishSponsorshipListing(listingId: string): Promise<SponsorshipListingRead> {
  return request.post<SponsorshipListingRead>(`/sponsorship-listings/${listingId}/publish`);
}

export function closeSponsorshipListing(listingId: string): Promise<SponsorshipListingRead> {
  return request.post<SponsorshipListingRead>(`/sponsorship-listings/${listingId}/close`);
}

export function createSponsorshipPackage(
  listingId: string,
  body: SponsorshipPackageCreate,
): Promise<SponsorshipPackageRead> {
  return request.post<SponsorshipPackageRead>(`/sponsorship-listings/${listingId}/packages`, body);
}

export function getSponsorshipPackages(listingId: string): Promise<SponsorshipPackageRead[]> {
  return request.get<SponsorshipPackageRead[]>(`/sponsorship-listings/${listingId}/packages`);
}

export function updateSponsorshipPackage(
  packageId: string,
  body: SponsorshipPackageUpdate,
): Promise<SponsorshipPackageRead> {
  return request.patch<SponsorshipPackageRead>(`/sponsorship-packages/${packageId}`, body);
}

export function deleteSponsorshipPackage(packageId: string): Promise<void> {
  return request.delete<void>(`/sponsorship-packages/${packageId}`);
}
