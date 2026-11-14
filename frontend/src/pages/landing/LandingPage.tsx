import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EventCard } from '@/components/domain/EventCard';
import { useEvents } from '@/hooks/useEvents';
import { useAuthStore } from '@/stores/authStore';
import { BrandDot } from '@/components/ui/StatusDot';

const FEATURES = [
  {
    icon: CalendarDays,
    title: 'Discover and register',
    body: 'Browse published events, register in one click, and track every registration from a single dashboard.',
  },
  {
    icon: Users,
    title: 'Form a team',
    body: 'Create a team with a one-time join code, invite teammates by email, and run the work on a shared board.',
  },
  {
    icon: Trophy,
    title: 'Submit and get judged',
    body: 'Ship versioned submissions, get scored against published criteria, and see the leaderboard when it opens.',
  },
];

/** Public landing page: brand statement plus a live preview of published events. */
export function LandingPage() {
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const { data, isLoading, isError, error, refetch } = useEvents({ limit: 3 });

  return (
    <div className="space-y-16">
      <section className="space-y-6 pt-6 text-center">
        <p className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-taupe">
          <BrandDot />
          Hackathons, conferences, and sponsorships
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
          Run the entire event lifecycle in one place.
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-taupe">
          Publish events, review registrations, run teams with tasks and chat, collect judged
          submissions, and close sponsorship deals — all on a single platform.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/events">
            <Button size="md" icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}>
              Browse events
            </Button>
          </Link>
          {isAuthenticated ? (
            <Link to="/dashboard">
              <Button variant="outline">Go to dashboard</Button>
            </Link>
          ) : (
            <Link to="/register">
              <Button variant="outline">Create an account</Button>
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-canvas text-forest">
              <feature.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-sm font-bold text-ink">{feature.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-taupe">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink">Upcoming on the platform</h2>
            <p className="text-xs text-taupe">The latest published, publicly visible events.</p>
          </div>
          <Link
            to="/events"
            className="inline-flex items-center gap-1 text-xs font-semibold text-rust hover:underline"
          >
            View all events
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No events published yet"
            description="As soon as an organizer publishes a public event it appears here."
            actions={
              <Link to="/events">
                <Button variant="outline">Check the events page</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
