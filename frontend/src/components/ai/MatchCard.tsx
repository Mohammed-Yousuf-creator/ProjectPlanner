import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { SkillMatchRead, TeamMatchRead } from '@/api/types';

/**
 * Match score presentation.
 *
 * The raw number is an unbounded weighted sum, so showing it as a percentage
 * would be a lie ("score 1.5" is not "150% match"). Instead the top score in a
 * result set becomes "Best fit" and the rest are ranked — which is what the
 * ordering actually means.
 */
function MatchRankBadge({ rank }: { rank: number }) {
  if (rank === 0) {
    return (
      <Badge variant="forest" className="gap-1">
        <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
        Best fit
      </Badge>
    );
  }
  return <Badge variant="neutral">#{rank + 1}</Badge>;
}

function SkillChips({
  skills,
  tone,
  max = 4,
  label,
}: {
  skills: string[];
  tone: 'good' | 'neutral';
  max?: number;
  label: string;
}) {
  if (skills.length === 0) return null;
  const shown = skills.slice(0, max);
  const rest = skills.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</span>
      {shown.map((skill) => (
        <span
          key={skill}
          className={cn(
            'rounded-lg border px-1.5 py-0.5 text-[10px] font-semibold',
            tone === 'good'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-line bg-canvas text-taupe',
          )}
        >
          {skill}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[10px] text-muted" title={skills.slice(max).join(', ')}>
          +{rest} more
        </span>
      )}
    </div>
  );
}

export function TeammateMatchCard({
  match,
  rank,
  eventId,
}: {
  match: SkillMatchRead;
  rank: number;
  eventId: string;
}) {
  const brings = match.complementary_skills ?? [];
  const shared = match.shared_skills ?? [];
  const reasons = match.reasons ?? [];

  return (
    <li className="rounded-xl border border-line-subtle bg-canvas p-3.5 transition-colors hover:border-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-xs font-bold text-ink">{match.display_name}</p>
            <MatchRankBadge rank={rank} />
          </div>
          <p className="font-mono text-[10px] text-muted">
            {match.username ? `@${match.username}` : 'Participant'}
            {match.city ? ` · ${match.city}` : ''}
          </p>
          {match.headline && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-taupe">{match.headline}</p>
          )}
        </div>
        <Link
          to={`/events/${eventId}/matchmaking`}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-rust hover:underline"
        >
          View event
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 space-y-1">
        <SkillChips skills={brings} tone="good" label="Brings" />
        <SkillChips skills={shared} tone="neutral" label="Shared" />
      </div>

      {reasons.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-taupe">{reasons.join(' · ')}</p>
      )}
    </li>
  );
}

export function TeamMatchCard({
  match,
  rank,
  eventId,
}: {
  match: TeamMatchRead;
  rank: number;
  eventId: string;
}) {
  const adds = match.complementary_skills ?? [];
  const covered = match.shared_skills ?? [];
  const reasons = match.reasons ?? [];

  return (
    <li className="rounded-xl border border-line-subtle bg-canvas p-3.5 transition-colors hover:border-line">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-xs font-bold text-ink">{match.team_name}</p>
            <MatchRankBadge rank={rank} />
          </div>
          <p className="inline-flex items-center gap-1 font-mono text-[10px] text-muted">
            <Users className="h-2.5 w-2.5" aria-hidden="true" />
            {match.member_count} {match.member_count === 1 ? 'member' : 'members'}
          </p>
        </div>
        <Link
          to={`/events/${eventId}/teams`}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-rust hover:underline"
        >
          See teams
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 space-y-1">
        <SkillChips skills={adds} tone="good" label="You add" />
        <SkillChips skills={covered} tone="neutral" label="Covered" />
      </div>

      {reasons.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-taupe">{reasons.join(' · ')}</p>
      )}
    </li>
  );
}
