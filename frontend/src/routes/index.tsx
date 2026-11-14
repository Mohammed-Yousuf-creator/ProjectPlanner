import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { GuestOnly, RequireAuth } from './guards';
import { NotFoundPage } from './NotFoundPage';
import { lazyPage } from './lazyPage';

// Every page is code-split: the shell + guards ship in the entry chunk and
// each route module is fetched on first navigation.
const LandingPage = lazyPage(() => import('@/pages/landing/LandingPage'), 'LandingPage');
const LoginPage = lazyPage(() => import('@/pages/auth/LoginPage'), 'LoginPage');
const RegisterPage = lazyPage(() => import('@/pages/auth/RegisterPage'), 'RegisterPage');
const EventsPage = lazyPage(() => import('@/pages/events/EventsPage'), 'EventsPage');
const EventDetailPage = lazyPage(() => import('@/pages/events/EventDetailPage'), 'EventDetailPage');
const EventProjectsPage = lazyPage(() => import('@/pages/events/EventProjectsPage'), 'EventProjectsPage');
const EventLeaderboardPage = lazyPage(() => import('@/pages/events/EventLeaderboardPage'), 'EventLeaderboardPage');
const EventSchedulePage = lazyPage(() => import('@/pages/events/EventSchedulePage'), 'EventSchedulePage');
const EventAnnouncementsPage = lazyPage(() => import('@/pages/events/EventAnnouncementsPage'), 'EventAnnouncementsPage');
const EventTeamsPage = lazyPage(() => import('@/pages/events/EventTeamsPage'), 'EventTeamsPage');
const EventMentorPage = lazyPage(() => import('@/pages/events/EventMentorPage'), 'EventMentorPage');
const DashboardPage = lazyPage(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage');
const MyRegistrationsPage = lazyPage(() => import('@/pages/participant/MyRegistrationsPage'), 'MyRegistrationsPage');
const MyEventDetailPage = lazyPage(() => import('@/pages/participant/MyEventDetailPage'), 'MyEventDetailPage');
const TeamInvitationsPage = lazyPage(() => import('@/pages/participant/TeamInvitationsPage'), 'TeamInvitationsPage');
const MyMentorRequestsPage = lazyPage(() => import('@/pages/participant/MyMentorRequestsPage'), 'MyMentorRequestsPage');
const TeamWorkspacePage = lazyPage(() => import('@/pages/team/TeamWorkspacePage'), 'TeamWorkspacePage');
const NotificationsPage = lazyPage(() => import('@/pages/notifications/NotificationsPage'), 'NotificationsPage');
const OrganizationsPage = lazyPage(() => import('@/pages/organizations/OrganizationsPage'), 'OrganizationsPage');
const CreateOrganizationPage = lazyPage(() => import('@/pages/organizations/CreateOrganizationPage'), 'CreateOrganizationPage');
const OrganizationDetailPage = lazyPage(() => import('@/pages/organizations/OrganizationDetailPage'), 'OrganizationDetailPage');
const CreateEventPage = lazyPage(() => import('@/pages/organizations/CreateEventPage'), 'CreateEventPage');
const OrgSponsorshipPage = lazyPage(() => import('@/pages/sponsorship/OrgSponsorshipPage'), 'OrgSponsorshipPage');
const ManageEventPage = lazyPage(() => import('@/pages/manage/ManageEventPage'), 'ManageEventPage');
const JudgeWorkspacePage = lazyPage(() => import('@/pages/judge/JudgeWorkspacePage'), 'JudgeWorkspacePage');
const SponsorsPage = lazyPage(() => import('@/pages/sponsors/SponsorsPage'), 'SponsorsPage');
const MarketplacePage = lazyPage(() => import('@/pages/marketplace/MarketplacePage'), 'MarketplacePage');
const ListingDetailPage = lazyPage(() => import('@/pages/marketplace/ListingDetailPage'), 'ListingDetailPage');
const ProposalPage = lazyPage(() => import('@/pages/marketplace/ProposalPage'), 'ProposalPage');
const DealPage = lazyPage(() => import('@/pages/marketplace/DealPage'), 'DealPage');


export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell width="narrow" />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:eventId', element: <EventDetailPage /> },
      { path: 'events/:eventId/schedule', element: <EventSchedulePage /> },
      { path: 'events/:eventId/leaderboard', element: <EventLeaderboardPage /> },
      { path: 'marketplace', element: <MarketplacePage /> },
      { path: 'marketplace/:listingId', element: <ListingDetailPage /> },
      { path: 'sponsors', element: <SponsorsPage /> },
    ],
  },
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestOnly>
        <RegisterPage />
      </GuestOnly>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'my/registrations', element: <MyRegistrationsPage /> },
      { path: 'my/events/:eventId', element: <MyEventDetailPage /> },
      { path: 'my/team-invitations', element: <TeamInvitationsPage /> },
      { path: 'my/mentor-requests', element: <MyMentorRequestsPage /> },
      { path: 'events/:eventId/teams', element: <EventTeamsPage /> },
      { path: 'events/:eventId/projects', element: <EventProjectsPage /> },
      { path: 'events/:eventId/announcements', element: <EventAnnouncementsPage /> },
      { path: 'events/:eventId/mentor', element: <EventMentorPage /> },
      { path: 'teams/:teamId', element: <TeamWorkspacePage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'organizations', element: <OrganizationsPage /> },
      { path: 'organizations/new', element: <CreateOrganizationPage /> },
      { path: 'organizations/:orgId', element: <OrganizationDetailPage /> },
      { path: 'organizations/:orgId/events/new', element: <CreateEventPage /> },
      { path: 'organizations/:orgId/sponsorship', element: <OrgSponsorshipPage /> },
      { path: 'manage/events/:eventId', element: <ManageEventPage /> },
      { path: 'judge/events/:eventId', element: <JudgeWorkspacePage /> },
      { path: 'sponsorship/proposals/:proposalId', element: <ProposalPage /> },
      { path: 'sponsorship/deals/:dealId', element: <DealPage /> },
    ],
  },
  // Convenience redirect for the friendliest legacy path.
  { path: '/home', element: <Navigate to="/" replace /> },
  { path: '*', element: <NotFoundPage /> },
]);
