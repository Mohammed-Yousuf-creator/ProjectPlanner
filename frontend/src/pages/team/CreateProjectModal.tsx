import { useAppForm } from '@/hooks/useAppForm';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useCreateProject } from '@/hooks/useProjects';
import { useEventTracks } from '@/hooks/useTracks';
import { toApiError } from '@/lib/errors';

const httpUrl = z
  .string()
  .optional()
  .refine(
    (value) => !value || /^https?:\/\/.+/i.test(value),
    'Links must start with http:// or https://',
  );

/** Mirrors `ProjectCreate`: title 1-255, abstract required, optional track + links. */
const schema = z.object({
  title: z.string().min(1, 'A title is required.').max(255, 'Titles are limited to 255 characters.'),
  tagline: z.string().max(255, 'Keep the tagline short.').optional(),
  abstract: z.string().min(1, 'An abstract is required.'),
  description: z.string().optional(),
  track_id: z.string().optional(),
  repo_url: httpUrl,
  demo_url: httpUrl,
  presentation_url: httpUrl,
});

type FormValues = z.infer<typeof schema>;

export function CreateProjectModal({
  open,
  eventId,
  teamId,
  onClose,
  onCreated,
}: {
  open: boolean;
  eventId: string;
  teamId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const tracks = useEventTracks(eventId);
  const createProject = useCreateProject(eventId, teamId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useAppForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      tagline: '',
      abstract: '',
      description: '',
      track_id: '',
      repo_url: '',
      demo_url: '',
      presentation_url: '',
    },
  });

  const submit = handleSubmit((values) => {
    createProject.mutate(
      {
        title: values.title.trim(),
        tagline: values.tagline?.trim() || null,
        abstract: values.abstract.trim(),
        description: values.description?.trim() || null,
        track_id: values.track_id || null,
        repo_url: values.repo_url?.trim() || null,
        demo_url: values.demo_url?.trim() || null,
        presentation_url: values.presentation_url?.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          onCreated();
        },
      },
    );
  });

  const apiError = createProject.error ? toApiError(createProject.error) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create project"
      description="This creates the project and its first draft submission (version 1)."
      maxWidth="max-w-2xl"
      dismissible={!createProject.isPending}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={createProject.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createProject.isPending}>
            Create project
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {apiError && (
          <Alert tone="error" title="Could not create the project">
            {apiError.message}
          </Alert>
        )}

        <Field label="Project title" htmlFor="project-title" error={errors.title?.message} required>
          <Input id="project-title" placeholder="Atlas: retrieval-augmented campus guide" invalid={Boolean(errors.title)} {...register('title')} />
        </Field>

        <Field label="Tagline" htmlFor="project-tagline" error={errors.tagline?.message}>
          <Input id="project-tagline" placeholder="One line judges will remember" {...register('tagline')} />
        </Field>

        <Field label="Abstract" htmlFor="project-abstract" error={errors.abstract?.message} required>
          <Textarea id="project-abstract" rows={4} placeholder="What problem does it solve, and how?" invalid={Boolean(errors.abstract)} {...register('abstract')} />
        </Field>

        <Field label="Detailed description" htmlFor="project-description" error={errors.description?.message}>
          <Textarea id="project-description" rows={3} placeholder="Architecture, data, and what is next." {...register('description')} />
        </Field>

        <Field label="Track" htmlFor="project-track" hint="Optional. Tracks come from the event.">
          <Select
            id="project-track"
            placeholder="No specific track"
            options={(tracks.data ?? []).map((track) => ({ value: track.id, label: track.name }))}
            {...register('track_id')}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Repository URL" htmlFor="project-repo" error={errors.repo_url?.message}>
            <Input id="project-repo" placeholder="https://github.com/…" {...register('repo_url')} />
          </Field>
          <Field label="Demo URL" htmlFor="project-demo" error={errors.demo_url?.message}>
            <Input id="project-demo" placeholder="https://…" {...register('demo_url')} />
          </Field>
          <Field label="Presentation URL" htmlFor="project-slides" error={errors.presentation_url?.message}>
            <Input id="project-slides" placeholder="https://…" {...register('presentation_url')} />
          </Field>
        </div>

        <p className="text-[11px] text-muted">
          Only http and https links are accepted, both here and by the server.
        </p>
      </form>
    </Modal>
  );
}
