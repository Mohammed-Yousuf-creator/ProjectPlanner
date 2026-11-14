import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HandCoins, Plus, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useMyOrganizations, useOrganization } from '@/hooks/useOrganizations';
import { canManageOrganization, findMyOrganizationRole } from '@/lib/permissions';
import { OrgSponsorshipListingsTab } from './OrgSponsorshipListingsTab';
import { OrgProposalsTab } from './OrgProposalsTab';
import { OrgDealsTab } from './OrgDealsTab';

const TABS: TabItem[] = [
  { value: 'listings', label: 'Listings' },
  { value: 'incoming', label: 'Incoming proposals' },
  { value: 'outgoing', label: 'Our proposals' },
  { value: 'deals', label: 'Deals' },
];

/**
 * Sponsorship console for one organization: its listings, both directions of
 * proposals, and its deals. Mutations require owner/admin on the server.
 */
export function OrgSponsorshipPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [tab, setTab] = useState('listings');

  const org = useOrganization(orgId);
  const mine = useMyOrganizations();
  const myRole = findMyOrganizationRole(mine.data, orgId);
  const canManage = canManageOrganization(myRole);

  if (org.isLoading || mine.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-md" />
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <SkeletonLines lines={6} />
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Sponsorship access required"
        description="Only owners and admins of this organization can manage sponsorship."
        actions={
          <Link to={`/organizations/${orgId}`}>
            <Button variant="outline">Back to organization</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sponsorship"
        title={org.data?.name ?? 'Organization'}
        description="Publish listings, answer proposals, and track delivered benefits."
        breadcrumbs={[
          { label: 'Organizations', to: '/organizations' },
          { label: org.data?.name ?? 'Organization', to: `/organizations/${orgId}` },
          { label: 'Sponsorship' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/marketplace">
              <Button variant="outline" size="sm" icon={<HandCoins className="h-3.5 w-3.5" aria-hidden="true" />}>
                Marketplace
              </Button>
            </Link>
            <Link to="/sponsors">
              <Button variant="chip" size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                Sponsor directory
              </Button>
            </Link>
          </div>
        }
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} aria-label="Sponsorship sections" />

      {tab === 'listings' && <OrgSponsorshipListingsTab orgId={orgId ?? ''} />}
      {tab === 'incoming' && <OrgProposalsTab orgId={orgId ?? ''} direction="incoming" />}
      {tab === 'outgoing' && <OrgProposalsTab orgId={orgId ?? ''} direction="outgoing" />}
      {tab === 'deals' && <OrgDealsTab orgId={orgId ?? ''} />}
    </div>
  );
}
