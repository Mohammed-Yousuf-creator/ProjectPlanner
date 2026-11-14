import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useCreateTeamTask } from '@/hooks/useTeamTasks';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants';
import { fromDateTimeLocal } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { TeamTaskCreateRequest } from '@/api/types';

const schema = z.object({
  title: z
    .string()
    .min(1, 'A title is required.')
    .max(255, 'Titles are limited to 255 characters.'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['todo', 'in_progress', 'review', 'done']),
  due_at: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateTaskModal({
  teamId,
  open,
  defaultStatus,
  onClose,
  onCreated,
}: {
  teamId: string;
  open: boolean;
  defaultStatus: TeamTaskCreateRequest['status'];
  onClose: () => void;
  onCreated: () => void;
}) {
  const createTask = useCreateTeamTask(teamId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      status: defaultStatus,
      due_at: '',
    },
    values: {
      title: '',
      description: '',
      priority: 'medium',
      status: defaultStatus,
      due_at: '',
    },
  });

  const submit = handleSubmit((values) => {
    createTask.mutate(
      {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        priority: values.priority,
        status: values.status,
        due_at: fromDateTimeLocal(values.due_at),
        position: 0,
      },
      {
        onSuccess: () => {
          reset();
          onCreated();
        },
      },
    );
  });

  const apiError = createTask.error ? toApiError(createTask.error) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      description="Tasks are visible to every active team member."
      maxWidth="max-w-lg"
      dismissible={!createTask.isPending}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={createTask.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createTask.isPending}>
            Create task
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {apiError && (
          <Alert tone="error" title="Could not create the task">
            {apiError.message}
          </Alert>
        )}

        <Field label="Title" htmlFor="task-title" error={errors.title?.message} required>
          <Input id="task-title" placeholder="Draft the submission abstract" invalid={Boolean(errors.title)} {...register('title')} />
        </Field>

        <Field label="Description" htmlFor="task-description" error={errors.description?.message}>
          <Textarea id="task-description" rows={3} placeholder="What needs to happen?" {...register('description')} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority" htmlFor="task-priority">
            <Select
              id="task-priority"
              options={TASK_PRIORITIES.map((option) => ({ value: option.value, label: option.label }))}
              {...register('priority')}
            />
          </Field>
          <Field label="Status" htmlFor="task-status">
            <Select
              id="task-status"
              options={TASK_STATUSES.map((option) => ({ value: option.value, label: option.label }))}
              {...register('status')}
            />
          </Field>
        </div>

        <Field
          label="Due date"
          htmlFor="task-due"
          hint="Optional. Stored in UTC, shown in your local time."
          error={errors.due_at?.message}
        >
          <Input id="task-due" type="datetime-local" {...register('due_at')} />
        </Field>
      </form>
    </Modal>
  );
}
