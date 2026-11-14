import { useEffect, useState } from 'react';
import { FilePlus2, History, Lock } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import {
  useCreateSubmission,
  useSubmitSubmission,
  useUpdateSubmission,
} from '@/hooks/useProjects';
import { formatDateTime } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { ProjectDetailRead, ProjectSubmissionRead } from '@/api/types';
import type { ProjectReadiness } from '@/lib/projectReadiness';

/**
 * Draft editing + version history.
 * - Submitted versions are immutable (server returns 409), so fields render
 *   disabled and only "new version" is offered when the latest is submitted.
 */
export function SubmissionPanel({
  project,
  teamId,
  canManage,
  readiness,
}: {
  project: ProjectDetailRead;
  teamId: string;
  canManage: boolean;
  readiness: ProjectReadiness | null;
}) {
  const toast = useToast();
  const latest = project.latest_submission;
  const isDraft = latest?.status === 'draft';

  const updateSubmission = useUpdateSubmission(project.id, teamId);
  const createSubmission = useCreateSubmission(project.id, teamId);
  const submitSubmission = useSubmitSubmission(project.id, teamId);

  const [form, setForm] = useState({
    title: latest?.title ?? '',
    tagline: latest?.tagline ?? '',
    abstract: latest?.abstract ?? '',
    description: latest?.description ?? '',
    repo_url: latest?.repo_url ?? '',
    demo_url: latest?.demo_url ?? '',
    presentation_url: latest?.presentation_url ?? '',
  });
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // Seed the editor when the *version* changes, not on every render of the
  // query result. Depending on `latest` (an object) re-ran every time react-query
  // handed back a new identity on a background refetch, which silently wiped
  // whatever the user was typing. `latest?.id` is the real identity of a draft,
  // and `latest?.updated_at` covers the case where the server changed the same
  // version (e.g. after a successful save).
  const latestKey = `${latest?.id ?? 'none'}:${latest?.updated_at ?? ''}`;
  useEffect(() => {
    setForm({
      title: latest?.title ?? '',
      tagline: latest?.tagline ?? '',
      abstract: latest?.abstract ?? '',
      description: latest?.description ?? '',
      repo_url: latest?.repo_url ?? '',
      demo_url: latest?.demo_url ?? '',
      presentation_url: latest?.presentation_url ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestKey]);

  const historyColumns: DataTableColumn<ProjectSubmissionRead>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (row) => <span className="font-mono text-xs font-bold text-ink">v{row.version_number}</span>,
    },
    {
      key: 'title',
      header: 'Title',
      render: (row) => <span className="text-xs text-ink">{row.title}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">
          {row.submitted_at ? formatDateTime(row.submitted_at) : '—'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">{formatDateTime(row.created_at)}</span>
      ),
    },
  ];

  const saveDraft = () => {
    if (!latest) return;
    updateSubmission.mutate(
      {
        submissionId: latest.id,
        body: {
          title: form.title.trim() || null,
          tagline: form.tagline.trim() || null,
          abstract: form.abstract.trim() || null,
          description: form.description.trim() || null,
          repo_url: form.repo_url.trim() || null,
          demo_url: form.demo_url.trim() || null,
          presentation_url: form.presentation_url.trim() || null,
        },
      },
      {
        onSuccess: () => toast.success('Draft saved.'),
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CardHeader
          title={isDraft ? 'Draft submission' : 'Latest submission'}
          description={
            latest
              ? `Version ${latest.version_number} · ${latest.status === 'draft' ? 'editable while it stays a draft' : 'submitted and immutable'}`
              : 'No submission versions exist yet.'
          }
          actions={
            latest && (
              <div className="flex items-center gap-2">
                <StatusBadge status={latest.status} />
                {latest.status === 'submitted' && (
                  <Badge variant="neutral">
                    <Lock className="h-3 w-3" aria-hidden="true" /> Locked
                  </Badge>
                )}
              </div>
            )
          }
        />

        {!latest ? (
          <p className="text-xs text-muted">Reload the page to fetch the initial draft.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="submission-title" required>
                <Input
                  id="submission-title"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  disabled={!isDraft || !canManage}
                />
              </Field>
              <Field label="Tagline" htmlFor="submission-tagline">
                <Input
                  id="submission-tagline"
                  value={form.tagline ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, tagline: event.target.value }))}
                  disabled={!isDraft || !canManage}
                />
              </Field>
            </div>

            <Field label="Abstract" htmlFor="submission-abstract" required>
              <Textarea
                id="submission-abstract"
                rows={3}
                value={form.abstract}
                onChange={(event) => setForm((prev) => ({ ...prev, abstract: event.target.value }))}
                disabled={!isDraft || !canManage}
              />
            </Field>

            <Field label="Description" htmlFor="submission-description">
              <Textarea
                id="submission-description"
                rows={3}
                value={form.description ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                disabled={!isDraft || !canManage}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Repository URL" htmlFor="submission-repo">
                <Input
                  id="submission-repo"
                  value={form.repo_url ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, repo_url: event.target.value }))}
                  disabled={!isDraft || !canManage}
                />
              </Field>
              <Field label="Demo URL" htmlFor="submission-demo">
                <Input
                  id="submission-demo"
                  value={form.demo_url ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, demo_url: event.target.value }))}
                  disabled={!isDraft || !canManage}
                />
              </Field>
              <Field label="Presentation URL" htmlFor="submission-slides">
                <Input
                  id="submission-slides"
                  value={form.presentation_url ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, presentation_url: event.target.value }))}
                  disabled={!isDraft || !canManage}
                />
              </Field>
            </div>

            {canManage ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
                {isDraft ? (
                  <>
                    <Button variant="outline" onClick={saveDraft} loading={updateSubmission.isPending}>
                      Save draft
                    </Button>
                    <Button
                      onClick={() => setConfirmSubmit(true)}
                      disabled={readiness ? !readiness.ready : false}
                    >
                      Submit final version
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() =>
                      createSubmission.mutate(undefined, {
                        onSuccess: () => toast.success('New draft version created.'),
                        onError: (error) => toast.error(toApiError(error).message),
                      })
                    }
                    loading={createSubmission.isPending}
                    icon={<FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    Start next version
                  </Button>
                )}
              </div>
            ) : (
              <Alert tone="info">
                Only team owners and leads can edit or submit project versions.
              </Alert>
            )}

            {isDraft && readiness && !readiness.ready && canManage && (
              <Alert tone="warning" title="Submission checks failing">
                <ul className="list-disc space-y-1 pl-4">
                  {readiness.blocking.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </>
        )}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line-subtle p-5">
          <History className="h-4 w-4 text-muted" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold text-ink">Version history</h3>
            <p className="text-[11px] text-taupe">Every submission version, including drafts.</p>
          </div>
        </div>
        <DataTable
          columns={historyColumns}
          rows={[...project.submissions].sort((a, b) => b.version_number - a.version_number)}
          rowKey={(row) => row.id}
          className="px-2 pb-2"
          emptyMessage="No submission versions yet."
        />
      </Card>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => {
          if (!latest) return;
          submitSubmission.mutate(latest.id, {
            onSuccess: () => {
              toast.success('Submission finalized. This version is now immutable.');
              setConfirmSubmit(false);
            },
            onError: (error) => {
              setConfirmSubmit(false);
              toast.error(toApiError(error).message);
            },
          });
        }}
        title="Submit this version?"
        description="Submitting is final for this version."
        confirmLabel="Submit version"
        loading={submitSubmission.isPending}
      >
        <ul className="list-disc space-y-1 pl-4">
          <li>This version becomes immutable — no further edits are allowed.</li>
          <li>The team status switches to <span className="font-mono">submitted</span>, which blocks new members from joining.</li>
          <li>You can still create a new version later; the previous one stays on record.</li>
        </ul>
      </ConfirmDialog>
    </div>
  );
}
