import { RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useAiStatus, useRegenerateSummary, useSubmissionSummary } from '@/hooks/useAi';
import { toApiError } from '@/lib/errors';

/**
 * AI overview of one submission.
 *
 * Lazy by design: `enabled` is false until the user asks for it, because
 * generation costs a model call and most visitors only want the abstract. The
 * panel is explicit about where the text came from and whether it is cached.
 */
export function SubmissionSummaryCard({
  submissionId,
  enabled,
}: {
  submissionId: string;
  enabled: boolean;
}) {
  const status = useAiStatus();
  const summary = useSubmissionSummary(submissionId, enabled);
  const regenerate = useRegenerateSummary();

  const data = summary.data;
  const isFallback = data?.source === 'fallback';
  // Server always sends arrays; the generated schema marks them optional, so
  // default here rather than scattering `?? []` through the JSX.
  const technologies = data?.technologies ?? [];
  const highlights = data?.highlights ?? [];
  const talkingPoints = data?.talking_points ?? [];

  return (
    <Card className="space-y-3">
      <CardHeader
        title="AI overview"
        description="What this submission is, in a judge's terms."
        actions={
          <div className="flex items-center gap-1.5">
            {data && (
              <Badge variant={isFallback ? 'neutral' : 'forest'}>
                {isFallback ? 'Extractive' : 'AI generated'}
              </Badge>
            )}
            <Button
              variant="chip"
              size="sm"
              loading={regenerate.isPending || (enabled && summary.isFetching)}
              icon={<RefreshCw className="h-3 w-3" aria-hidden="true" />}
              onClick={() => regenerate.mutate(submissionId)}
            >
              {data ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        }
      />

      {!enabled ? (
        <EmptyState
          inline
          icon={Wand2}
          title="Overview not generated yet"
          description="Generate a summary to see the problem, the approach, and questions worth asking in a demo."
          actions={
            <Button
              icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => regenerate.mutate(submissionId)}
            >
              Generate overview
            </Button>
          }
        />
      ) : summary.isLoading ? (
        <SkeletonLines lines={5} />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : !data ? (
        <EmptyState inline icon={Wand2} title="No overview available" />
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl border border-line-subtle bg-canvas px-3 py-2 text-xs font-semibold leading-relaxed text-ink">
            {data.tldr}
          </p>

          <div className="space-y-2">
            {data.overview.split('\n\n').map((paragraph, index) => (
              <p key={index} className="text-xs leading-relaxed text-taupe">
                {paragraph}
              </p>
            ))}
          </div>

          {technologies.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Technologies
              </p>
              <div className="flex flex-wrap gap-1">
                {technologies.map((tech) => (
                  <Badge key={tech} variant="category">
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {highlights.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Highlights
              </p>
              <ul className="space-y-1">
                {highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-1.5 text-[11px] leading-relaxed text-taupe">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-lg bg-forest" aria-hidden="true" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {talkingPoints.length > 0 && (
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Questions to ask
              </p>
              <ul className="space-y-1">
                {talkingPoints.map((point) => (
                  <li key={point} className="flex gap-1.5 text-[11px] leading-relaxed text-taupe">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-lg bg-rust" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isFallback && (
            <Alert tone="info">
              {status.data?.ai_enabled
                ? 'The AI service was unavailable, so this is an extractive summary taken from the submission text itself.'
                : 'AI is not configured on this server, so this summary quotes the submission rather than interpreting it.'}
            </Alert>
          )}

          {regenerate.isError && (
            <Alert tone="error" title="Could not regenerate">
              {toApiError(regenerate.error).message}
            </Alert>
          )}
        </div>
      )}
    </Card>
  );
}
