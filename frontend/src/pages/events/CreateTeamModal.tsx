import { useAppForm } from '@/hooks/useAppForm';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useCreateTeam } from '@/hooks/useTeams';
import { toApiError } from '@/lib/errors';
import type { TeamCreatedResponse } from '@/api/types';

/** Mirrors `TeamCreateRequest`: name 2-150 chars, optional description. */
const schema = z.object({
  name: z
    .string()
    .min(2, 'Team name must be at least 2 characters.')
    .max(150, 'Team name must be 150 characters or fewer.'),
  description: z.string().max(2000, 'Keep the description under 2000 characters.').optional(),
  generate_join_code: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function CreateTeamModal({
  eventId,
  open,
  onClose,
  onCreated,
}: {
  eventId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (team: TeamCreatedResponse) => void;
}) {
  const createTeam = useCreateTeam(eventId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useAppForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', generate_join_code: true },
  });

  const apiError = createTeam.error ? toApiError(createTeam.error) : null;

  const close = () => {
    if (createTeam.isPending) return;
    reset();
    createTeam.reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create a team"
      description="You become the team owner. One team per event, per participant."
      dismissible={!createTeam.isPending}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={createTeam.isPending}>
            Cancel
          </Button>
          <Button
            loading={createTeam.isPending}
            onClick={handleSubmit((values) =>
              createTeam.mutate(
                {
                  name: values.name.trim(),
                  description: values.description?.trim() || null,
                  generate_join_code: values.generate_join_code,
                },
                {
                  onSuccess: (team) => {
                    reset();
                    onCreated(team);
                  },
                },
              ),
            )}
          >
            Create team
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) =>
          createTeam.mutate(
            {
              name: values.name.trim(),
              description: values.description?.trim() || null,
              generate_join_code: values.generate_join_code,
            },
            {
              onSuccess: (team) => {
                reset();
                onCreated(team);
              },
            },
          ),
        )}
      >
        {apiError && (
          <Alert tone="error" title="Could not create the team">
            {apiError.message}
          </Alert>
        )}

        <Field label="Team name" htmlFor="team-name" error={errors.name?.message} required>
          <Input id="team-name" placeholder="e.g. Latent Space Collective" invalid={Boolean(errors.name)} {...register('name')} />
        </Field>

        <Field
          label="Description"
          htmlFor="team-description"
          hint="Optional. What is your team building?"
          error={errors.description?.message}
        >
          <Textarea
            id="team-description"
            rows={3}
            placeholder="We are building a retrieval-augmented assistant for campus navigation."
            {...register('description')}
          />
        </Field>

        <label className="flex items-start gap-2 rounded-xl border border-line bg-canvas p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 rounded border-line text-forest focus:ring-1 focus:ring-forest"
            {...register('generate_join_code')}
          />
          <span className="space-y-0.5">
            <span className="block text-xs font-semibold text-ink">Generate a join code</span>
            <span className="block text-[11px] text-taupe">
              Teammates can join instantly with a one-time code shown right after creation. Without a
              code you must invite people by email.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
