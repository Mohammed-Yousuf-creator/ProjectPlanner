import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatRelative } from '@/lib/format';
import type { TeamDiscoveryItem } from '@/api/types';

export function TeamCard({
  team,
  onJoin,
  isMyTeam,
  joinDisabled,
}: {
  team: TeamDiscoveryItem;
  onJoin?: () => void;
  isMyTeam?: boolean;
  joinDisabled?: boolean;
}) {
  const full = team.available_slots <= 0;

  return (
    <div
      className={
        'flex flex-col justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-all ' +
        (isMyTeam ? 'border-forest/40' : 'border-line hover:border-rust/40')
      }
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge status={team.status} />
          {isMyTeam && (
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-emerald-800">
              Your team
            </span>
          )}
        </div>
        <h3 className="text-sm font-bold text-ink">{team.name}</h3>
        {team.description ? (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-taupe">{team.description}</p>
        ) : (
          <p className="text-[11px] text-muted">No description provided.</p>
        )}
      </div>

      <div className="space-y-3 border-t border-line-subtle pt-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-mono text-taupe">
            <Users className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
            {team.member_count} / {team.max_team_size}
          </span>
          <span className="font-mono text-taupe">
            {full ? 'Full' : `${team.available_slots} open`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted">Created {formatRelative(team.created_at)}</span>
          <div className="flex items-center gap-2">
            <Link to={`/teams/${team.id}`}>
              <Button variant="outline" size="sm">
                View
              </Button>
            </Link>
            {onJoin && (
              <Button size="sm" onClick={onJoin} disabled={full || joinDisabled}>
                Join
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
