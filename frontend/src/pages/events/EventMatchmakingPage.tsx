import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Info, Sparkles, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { TeamMatchCard, TeammateMatchCard } from '@/components/ai/MatchCard';
import { usePreviewMatches, useTeammateMatches, useTeamMatches } from '@/hooks/useAi';
import { toApiError } from '@/lib/errors';

/**
 * Skill-based matchmaking.
 *
 * The ranking is a deterministic algorithm (see `skill_matching.py`), not a
 * model, and the UI says so — every card shows *why* it scored, which is the
 * whole point of using an explainable algorithm here.
 */
export function EventMatchmakingPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const toast = useToast();
  const [tab, setTab] = useState<'people' | 'teams'>('people');
  const [previewDraft, setPreviewDraft] = useState('');

  const teammates = useTeammateMatches(eventId, tab === 'people');
  const teams = useTeamMatches(eventId, tab === 'teams');
  const preview = usePreviewMatches(eventId);

  const activeQuery = tab === 'people' ? teammates : teams;
  // The generated schema types every list as optional; the server always sends
  // them, so normalise once here.
  const previewMatches = preview.data?.matches ?? [];
  const previewSkills = preview.data?.my_skills ?? [];
  const previewNote = preview.data?.note;
  // Kept separate, not merged into one list: `SkillMatchRead` and
  // `TeamMatchRead` are different shapes and a union loses both.
  const teammateMatches = teammates.data?.matches ?? [];
  const teamMatches = teams.data?.matches ?? [];
  const activeCount =
    tab === 'people' ? teammateMatches.length : teamMatches.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Matchmaking"
        title="Find your missing piece"
        description="Ranked by what complements your skills, not by who has the most. The algorithm prefers teammates who bring something you lack."
      />

      <Alert tone="info" title="How this ranks people">
        Each skill is weighted by rarity — a skill few people have counts for more. A candidate
        scores by the skills they have that you do not, minus a penalty for the ones you share. That
        is why near-duplicates of your own profile surface last or not at all.
      </Alert>

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as 'people' | 'teams')}
        tabs={[
          { value: 'people', label: 'Teammates' },
          { value: 'teams', label: 'Teams' },
        ]}
        aria-label="Matchmaking view"
      />

      <Card className="space-y-3">
        <CardHeader
          title="Preview different skills"
          description="See how the ranking changes with a skill you do not have yet. Nothing is saved."
        />
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={previewDraft}
            onChange={(event) => setPreviewDraft(event.target.value)}
            placeholder="e.g. Rust, Figma, Kubernetes"
            aria-label="Skills to preview"
            className="max-w-md"
          />
          <Button
            variant="outline"
            loading={preview.isPending}
            icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => {
              const skills = previewDraft
                .split(',')
                .map((skill) => skill.trim())
                .filter(Boolean);
              if (skills.length === 0) {
                toast.error('Add at least one skill to preview.');
                return;
              }
              preview.mutate(skills);
            }}
          >
            Preview
          </Button>
        </div>

        {preview.isError && (
          <Alert tone="error">{toApiError(preview.error).message}</Alert>
        )}

        {preview.data && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-taupe">
              With <span className="font-semibold text-ink">{previewSkills.join(', ')}</span>
              , these people would be suggested:
            </p>
            {previewMatches.length === 0 ? (
              <p className="text-[11px] text-muted">
                {previewNote ?? 'Nobody in this event would be a strong complement.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {previewMatches.map((match, index) => (
                  <TeammateMatchCard
                    key={match.user_id}
                    match={match}
                    rank={index}
                    eventId={eventId ?? ''}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-line-subtle p-5">
          <h2 className="text-sm font-bold text-ink">
            {tab === 'people' ? 'Suggested teammates' : 'Teams that need you'}
          </h2>
          <p className="text-[11px] text-taupe">
            {tab === 'people'
              ? 'Registered participants ranked against your skills.'
              : 'Open teams ranked by what you would add to them.'}
          </p>
          {(activeQuery.data?.my_skills ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                Your skills
              </span>
              {(activeQuery.data?.my_skills ?? []).map((skill) => (
                <Badge key={skill} variant="neutral">
                  {skill}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {activeQuery.isLoading ? (
          <div className="p-5">
            <SkeletonLines lines={5} />
          </div>
        ) : activeQuery.isError ? (
          <div className="p-5">
            <ErrorState error={activeQuery.error} onRetry={() => void activeQuery.refetch()} />
          </div>
        ) : activeCount === 0 ? (
          <div className="p-5">
            <EmptyState
              inline
              icon={tab === 'people' ? Users : Info}
              title={
                activeQuery.data?.has_skills === false
                  ? 'Add your skills first'
                  : 'No matches right now'
              }
              description={
                activeQuery.data?.note ??
                'We need a little more information before we can suggest anything.'
              }
            />
          </div>
        ) : (
          <ul className="space-y-2 p-5">
            {tab === 'people'
              ? teammateMatches.map((match, index) => (
                  <TeammateMatchCard
                    key={match.user_id}
                    match={match}
                    rank={index}
                    eventId={eventId ?? ''}
                  />
                ))
              : teamMatches.map((match, index) => (
                  <TeamMatchCard
                    key={match.team_id}
                    match={match}
                    rank={index}
                    eventId={eventId ?? ''}
                  />
                ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
