import { Link } from 'react-router-dom';
import { CalendarCheck2, CalendarClock, Clock3, Mail, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard, SkeletonLines } from '@/components/ui/Skeleton';
import { EventMiniCard } from './EventMiniCard';
import { RoleEventsPanel } from './RoleEventsPanel';
import { useParticipantDashboard, useMyTeamInvitations } from '@/hooks/useParticipant';
import { useAuthStore, getDisplayName } from '@/stores/authStore';
import { useLogout } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import type { ParticipantEventItem, ParticipantSummary } from '@/api/types';
import { Alert } from '@/components/ui/Alert';

const METRICS: { key: keyof ParticipantSummary; label: string }[] = [
  { key: 'total_active_registrations', label: 'Active registrations' },
  { key: 'upcoming_events_count', label: 'Upcoming' },
  { key: 'ongoing_events_count', label: 'Ongoing' },
  { key: 'completed_events_count', label: 'Completed' },
  { key: 'waitlisted_events_count', label: 'Waitlisted' },
];

/** Participant home. Metrics and the four collections come from one endpoint. */
export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const dashboard = useParticipantDashboard();
  const invitations = useMyTeamInvitations();

  if (dashboard.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-md" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (dashboard.isError) {
    return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  }

  const data = dashboard.data;
  if (!data) return null;

  const sections: { title: string; items: ParticipantEventItem[]; empty: string }[] = [
    {
      title: 'Upcoming events',
      items: data.upcoming_events,
      empty: 'No upcoming events. Browse events to register for something new.',
    },
    {
      title: 'Ongoing events',
      items: data.ongoing_events,
      empty: 'Nothing is running right now.',
    },
    {
      title: 'Completed events',
      items: data.completed_events,
      empty: 'You have not completed an event yet.',
    },
    {
      title: 'Waitlisted',
      items: data.waitlisted_events,
      empty: 'You are not on any waitlist.',
    },
  ];

  const inviteCount = invitations.data?.length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Participant dashboard"
        title={`Welcome back, ${data.user.display_name || getDisplayName(user)}`}
        description={
          data.user.headline ??
          'Your registrations, teams, and submissions in one place.'
        }
        actions={
          <>
            <Link to="/events">
              <Button variant="outline">Browse events</Button>
            </Link>
            {inviteCount > 0 && (
              <Link to="/my/team-invitations">
                <Button icon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}>
                  {inviteCount} team {inviteCount === 1 ? 'invitation' : 'invitations'}
                </Button>
              </Link>
            )}
            <Button
              variant="chip"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign out
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {METRICS.map((metric) => (
          <div
            key={metric.key}
            className="rounded-2xl border border-line bg-white p-4 shadow-sm"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {metric.label}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-forest">{data.summary[metric.key]}</p>
          </div>
        ))}
      </section>

      <RoleEventsPanel />

      {inviteCount > 0 && (
        <Alert
          tone="info"
          title="Pending team invitations"
          actions={
            <Link to="/my/team-invitations">
              <Button variant="outline" size="sm">
                Review
              </Button>
            </Link>
          }
        >
          You have {inviteCount} pending team {inviteCount === 1 ? 'invitation' : 'invitations'} that
          expire 7 days after they were sent.
        </Alert>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="space-y-4">
            <CardHeader
              title={section.title}
              actions={<Badge variant="neutral">{section.items.length}</Badge>}
            />
            {section.items.length === 0 ? (
              <EmptyState
                inline
                icon={
                  section.title === 'Upcoming events'
                    ? CalendarClock
                    : section.title === 'Completed events'
                      ? Trophy
                      : section.title === 'Ongoing events'
                        ? CalendarCheck2
                        : Clock3
                }
                title="Nothing here yet"
                description={section.empty}
              />
            ) : (
              <div className="space-y-2">
                {section.items.map((item) => (
                  <EventMiniCard key={item.membership_id} item={item} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickLink to="/my/registrations" title="My registrations" body="Every active registration and its status." />
        <QuickLink to="/my/mentor-requests" title="My mentor requests" body="Track help requests you raised." />
        <QuickLink to="/organizations" title="Organizations" body="Manage events and sponsorship as an organizer." />
      </section>
    </div>
  );
}

function QuickLink({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-line bg-white p-4 shadow-sm transition-all hover:border-rust/60 hover:shadow-md"
    >
      <p className="text-xs font-bold text-ink group-hover:text-rust">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-taupe">{body}</p>
    </Link>
  );
}
