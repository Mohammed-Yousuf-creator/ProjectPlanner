import { useAppForm } from '@/hooks/useAppForm';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useJoinTeam } from '@/hooks/useTeams';
import { toApiError } from '@/lib/errors';
import type { TeamDiscoveryItem } from '@/api/types';

const schema = z.object({
  join_code: z.string().min(1, 'Enter the join code you were given.'),
});

type FormValues = z.infer<typeof schema>;

export function JoinTeamModal({
  eventId,
  team,
  onClose,
  onJoined,
}: {
  eventId: string;
  team: TeamDiscoveryItem | null;
  onClose: () => void;
  onJoined: () => void;
}) {
  const join = useJoinTeam(eventId, team?.id ?? '');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useAppForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { join_code: '' } });

  const apiError = join.error ? toApiError(join.error) : null;

  const close = () => {
    if (join.isPending) return;
    reset();
    join.reset();
    onClose();
  };

  return (
    <Modal
      open={Boolean(team)}
      onClose={close}
      title={team ? `Join ${team.name}` : 'Join team'}
      description="Enter the join code shared by the team owner."
      maxWidth="max-w-md"
      dismissible={!join.isPending}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={join.isPending}>
            Cancel
          </Button>
          <Button
            loading={join.isPending}
            onClick={handleSubmit((values) =>
              join.mutate(
                { join_code: values.join_code.trim() },
                {
                  onSuccess: () => {
                    reset();
                    onJoined();
                  },
                },
              ),
            )}
          >
            Join team
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) =>
          join.mutate(
            { join_code: values.join_code.trim() },
            {
              onSuccess: () => {
                reset();
                onJoined();
              },
            },
          ),
        )}
      >
        {apiError && (
          <Alert tone="error" title="Could not join this team">
            {apiError.message}
          </Alert>
        )}
        <Field label="Join code" htmlFor="join-code" error={errors.join_code?.message} required>
          <Input
            id="join-code"
            autoComplete="off"
            placeholder="e.g. 9F3A2C1B"
            className="font-mono uppercase tracking-[0.2em]"
            invalid={Boolean(errors.join_code)}
            {...register('join_code')}
          />
        </Field>
        <p className="text-[11px] text-muted">
          The server rejects wrong codes, full teams, disbanded or submitted teams, and users who
          already belong to another team in this event.
        </p>
      </form>
    </Modal>
  );
}
