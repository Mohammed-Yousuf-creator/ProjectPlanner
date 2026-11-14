import { ContextSidebar } from '@/components/layout/ContextSidebar';

/** Reusable rail for anything scoped under `/organizations/:orgId`. */
export function OrganizationSidebar({ orgId }: { orgId: string }) {
  return (
    <ContextSidebar
      sections={[
        {
          title: 'Organization',
          items: [
            { to: `/organizations/${orgId}`, label: 'Overview', end: true },
            { to: `/organizations/${orgId}/events/new`, label: 'Create event' },
            { to: `/organizations/${orgId}/sponsorship`, label: 'Sponsorship' },
          ],
        },
        {
          title: 'Platform',
          items: [
            { to: '/organizations', label: 'All organizations', end: true },
            { to: '/dashboard', label: 'Dashboard', end: true },
          ],
        },
      ]}
    />
  );
}
