import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormErrorSummary } from '@/components/domain/FormErrorSummary';
import { EventFormFields } from '@/components/domain/EventFormFields';
import { useCreateOrganizationEvent } from '@/hooks/useOrganizations';
import { useToast } from '@/components/ui/Toast';
import { fromDateTimeLocal } from '@/lib/format';
import { toApiError } from '@/lib/errors';

/**
 * Client validation mirrors the backend's documented invariants:
 * `min_team_size >= 1`, `max_team_size >= min_team_size`, `format` enum, and
 * chronological timing. The server validates again (including timezone + venue
 * on publish).
 */
const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters.').max(200, 'Name is too long.'),
    slug: z.string().optional(),
    short_description: z.string().optional(),
    description: z.string().optional(),
    event_type: z.string().min(2, 'Describe the event type.').max(50, 'Keep it under 50 characters.'),
    format: z.enum(['online', 'offline', 'hybrid']),
    visibility: z.enum(['public', 'private', 'unlisted']),
    timezone: z.string().max(100, 'Timezone is limited to 100 characters.'),
    starts_at: z.string().optional(),
    ends_at: z.string().optional(),
    registration_opens_at: z.string().optional(),
    registration_closes_at: z.string().optional(),
    submission_deadline_at: z.string().optional(),
    venue_name: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    min_team_size: z.number().int().min(1, 'Minimum team size must be at least 1.'),
    max_team_size: z.number().int().min(1, 'Maximum team size must be at least 1.'),
  })
  .refine((values) => values.max_team_size >= values.min_team_size, {
    message: 'Maximum team size must be greater than or equal to the minimum.',
    path: ['max_team_size'],
  })
  .refine(
    (values) =>
      !values.starts_at || !values.ends_at || new Date(values.ends_at) >= new Date(values.starts_at),
    { message: 'The event must end after it starts.', path: ['ends_at'] },
  )
  .refine(
    (values) =>
      !values.registration_opens_at ||
      !values.registration_closes_at ||
      new Date(values.registration_closes_at) >= new Date(values.registration_opens_at),
    { message: 'Registration must close after it opens.', path: ['registration_closes_at'] },
  );

type FormValues = z.infer<typeof schema>;

export function CreateEventPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const createEvent = useCreateOrganizationEvent(orgId ?? '');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      slug: '',
      short_description: '',
      description: '',
      event_type: 'hackathon',
      format: 'offline',
      visibility: 'public',
      timezone: 'Asia/Kolkata',
      starts_at: '',
      ends_at: '',
      registration_opens_at: '',
      registration_closes_at: '',
      submission_deadline_at: '',
      venue_name: '',
      address: '',
      city: '',
      country: '',
      min_team_size: 2,
      max_team_size: 4,
    },
  });

  const onSubmit = handleSubmit((values) => {
    createEvent.mutate(
      {
        name: values.name.trim(),
        slug: values.slug?.trim() || null,
        short_description: values.short_description?.trim() || null,
        description: values.description?.trim() || null,
        event_type: values.event_type.trim(),
        format: values.format,
        visibility: values.visibility,
        timezone: values.timezone.trim() || 'UTC',
        starts_at: fromDateTimeLocal(values.starts_at),
        ends_at: fromDateTimeLocal(values.ends_at),
        registration_opens_at: fromDateTimeLocal(values.registration_opens_at),
        registration_closes_at: fromDateTimeLocal(values.registration_closes_at),
        submission_deadline_at: fromDateTimeLocal(values.submission_deadline_at),
        venue_name: values.venue_name?.trim() || null,
        address: values.address?.trim() || null,
        city: values.city?.trim() || null,
        country: values.country?.trim() || null,
        min_team_size: values.min_team_size,
        max_team_size: values.max_team_size,
      },
      {
        onSuccess: (event) => {
          toast.success('Event created as a draft. Publish it when you are ready.');
          navigate(`/manage/events/${event.id}`);
        },
      },
    );
  });

  const apiError = createEvent.error ? toApiError(createEvent.error) : null;
  const errorCount = Object.keys(errors).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Organizer"
        title="Create an event"
        description="New events start as drafts. Publishing is a separate, validated step."
        breadcrumbs={[
          { label: 'Organizations', to: '/organizations' },
          { label: 'Organization', to: `/organizations/${orgId}` },
          { label: 'New event' },
        ]}
      />

      <Card>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {apiError && (
            <Alert tone="error" title="Could not create the event">
              {apiError.message}
            </Alert>
          )}
          {errorCount > 0 && <FormErrorSummary errors={errors} />}

          <EventFormFields register={register} errors={errors} />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-4">
            <Button variant="outline" type="button" onClick={() => navigate(`/organizations/${orgId}`)}>
              Cancel
            </Button>
            <Button type="submit" loading={createEvent.isPending}>
              Create draft event
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
