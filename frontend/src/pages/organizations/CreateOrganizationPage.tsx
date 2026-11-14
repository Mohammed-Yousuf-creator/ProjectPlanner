import { useNavigate } from 'react-router-dom';
import { useAppForm } from '@/hooks/useAppForm';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';
import { useCreateOrganization } from '@/hooks/useOrganizations';
import { ORGANIZATION_TYPES } from '@/lib/constants';
import { toApiError } from '@/lib/errors';

/** Mirrors `OrganizationCreate`: name 2-200, slug optional, type enum. */
const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.').max(200, 'Name is too long.'),
  slug: z
    .string()
    .optional()
    .refine(
      (value) => !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
      'Use lowercase letters, numbers and single hyphens.',
    ),
  organization_type: z.enum(['organizer', 'sponsor', 'both', 'other']),
  description: z.string().optional(),
  website_url: z
    .string()
    .optional()
    .refine((value) => !value || /^https?:\/\/.+/i.test(value), 'Must start with http:// or https://'),
  contact_email: z
    .string()
    .optional()
    .refine(
      (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      'Enter a valid email address.',
    ),
});

type FormValues = z.infer<typeof schema>;

export function CreateOrganizationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createOrg = useCreateOrganization();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useAppForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      slug: '',
      organization_type: 'organizer',
      description: '',
      website_url: '',
      contact_email: '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    createOrg.mutate(
      {
        name: values.name.trim(),
        slug: values.slug?.trim() || null,
        organization_type: values.organization_type,
        description: values.description?.trim() || null,
        website_url: values.website_url?.trim() || null,
        contact_email: values.contact_email?.trim() || null,
        logo_url: null,
      },
      {
        onSuccess: (org) => {
          toast.success(`${org.name} created. You are the owner.`);
          navigate(`/organizations/${org.id}`);
        },
        onError: (error) => {
          const apiError = toApiError(error);
          if (apiError.status === 409) {
            // Slug collisions arrive as a string detail.
            if (apiError.message.toLowerCase().includes('slug')) {
              setError('slug', { message: apiError.message });
            } else {
              toast.error(apiError.message);
            }
          }
        },
      },
    );
  });

  const apiError = createOrg.error ? toApiError(createOrg.error) : null;
  const showTopError = apiError && apiError.status !== 409;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Organizer"
        title="Create an organization"
        description="You become the owner automatically. Owners and admins can publish events under this organization."
        breadcrumbs={[{ label: 'Organizations', to: '/organizations' }, { label: 'New' }]}
      />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {showTopError && (
            <Alert tone="error" title="Could not create the organization">
              {apiError.message}
            </Alert>
          )}

          <Field label="Organization name" htmlFor="org-name" error={errors.name?.message} required>
            <Input id="org-name" placeholder="Aurora Labs" invalid={Boolean(errors.name)} {...register('name')} />
          </Field>

          <Field
            label="Slug"
            htmlFor="org-slug"
            hint="Optional and globally unique. Leave blank to let the server derive it from the name."
            error={errors.slug?.message}
          >
            <Input id="org-slug" placeholder="aurora-labs" invalid={Boolean(errors.slug)} {...register('slug')} />
          </Field>

          <Field label="Organization type" htmlFor="org-type" required>
            <Select
              id="org-type"
              options={ORGANIZATION_TYPES.map((type) => ({ value: type.value, label: type.label }))}
              {...register('organization_type')}
            />
          </Field>

          <Field label="Description" htmlFor="org-description" error={errors.description?.message}>
            <Textarea id="org-description" rows={3} placeholder="What does this organization run?" {...register('description')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website" htmlFor="org-website" error={errors.website_url?.message}>
              <Input id="org-website" placeholder="https://example.com" {...register('website_url')} />
            </Field>
            <Field label="Contact email" htmlFor="org-email" error={errors.contact_email?.message}>
              <Input id="org-email" type="email" placeholder="events@example.com" {...register('contact_email')} />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-3">
            <Button variant="outline" type="button" onClick={() => navigate('/organizations')}>
              Cancel
            </Button>
            <Button type="submit" loading={createOrg.isPending}>
              Create organization
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
