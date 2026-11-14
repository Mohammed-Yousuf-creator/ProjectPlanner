import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { EVENT_FORMATS, EVENT_TYPE_SUGGESTIONS, EVENT_VISIBILITIES } from '@/lib/constants';
import type { UseFormRegister } from 'react-hook-form';

/** Minimal error shape so any event form's FieldErrors can be passed in. */
export type EventFieldErrors = Partial<
  Record<keyof EventFormValues, { message?: string } | undefined>
>;

export type EventFormValues = {
  name: string;
  slug?: string;
  short_description?: string;
  description?: string;
  event_type: string;
  format: 'online' | 'offline' | 'hybrid';
  visibility: 'public' | 'private' | 'unlisted';
  timezone: string;
  starts_at?: string;
  ends_at?: string;
  registration_opens_at?: string;
  registration_closes_at?: string;
  submission_deadline_at?: string;
  venue_name?: string;
  address?: string;
  city?: string;
  country?: string;
  min_team_size: number;
  max_team_size: number;
};

/** Fields the shared form renders — the host form may add derived refinements. */
export type EventFormFieldValues = EventFormValues;

/**
 * Shared field set for `EventCreate` and `EventUpdate`.
 * All datetimes are `<input type="datetime-local">` wall-clock values and are
 * converted to UTC ISO strings by the caller before submission.
 */
export function EventFormFields({
  register,
  errors,
  disabled = false,
}: {
  register: UseFormRegister<EventFormValues>;
  errors: EventFieldErrors;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-rust">Basics</h3>
        <Field label="Event name" htmlFor="event-name" error={errors.name?.message} required>
          <Input id="event-name" placeholder="Winter Build Sprint 2027" disabled={disabled} invalid={Boolean(errors.name)} {...register('name')} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Slug"
            htmlFor="event-slug"
            hint="Optional. Unique per organization."
            error={errors.slug?.message}
          >
            <Input id="event-slug" placeholder="winter-build-sprint" disabled={disabled} {...register('slug')} />
          </Field>
          <Field
            label="Event type"
            htmlFor="event-type"
            hint="Free text, e.g. hackathon, conference."
            error={errors.event_type?.message}
            required
          >
            <Input
              id="event-type"
              list="event-type-options"
              placeholder="hackathon"
              disabled={disabled}
              invalid={Boolean(errors.event_type)}
              {...register('event_type')}
            />
            <datalist id="event-type-options">
              {EVENT_TYPE_SUGGESTIONS.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field label="Short description" htmlFor="event-short" error={errors.short_description?.message}>
          <Input
            id="event-short"
            placeholder="One sentence shown on the event card"
            disabled={disabled}
            {...register('short_description')}
          />
        </Field>

        <Field label="Full description" htmlFor="event-description" error={errors.description?.message}>
          <Textarea
            id="event-description"
            rows={4}
            placeholder="Rules, prizes, schedule highlights, and what participants should bring."
            disabled={disabled}
            {...register('description')}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-rust">Format & visibility</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Format" htmlFor="event-format" required>
            <Select
              id="event-format"
              disabled={disabled}
              options={EVENT_FORMATS.map((option) => ({ value: option.value, label: option.label }))}
              {...register('format')}
            />
          </Field>
          <Field label="Visibility" htmlFor="event-visibility">
            <Select
              id="event-visibility"
              disabled={disabled}
              options={EVENT_VISIBILITIES.map((option) => ({ value: option.value, label: option.label }))}
              {...register('visibility')}
            />
          </Field>
          <Field label="Timezone" htmlFor="event-timezone" hint="IANA name, e.g. Asia/Kolkata">
            <Input id="event-timezone" placeholder="Asia/Kolkata" disabled={disabled} {...register('timezone')} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-rust">Timing</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts at" htmlFor="event-starts" error={errors.starts_at?.message}>
            <Input id="event-starts" type="datetime-local" disabled={disabled} {...register('starts_at')} />
          </Field>
          <Field label="Ends at" htmlFor="event-ends" error={errors.ends_at?.message}>
            <Input id="event-ends" type="datetime-local" disabled={disabled} {...register('ends_at')} />
          </Field>
          <Field label="Registration opens" htmlFor="event-reg-opens">
            <Input id="event-reg-opens" type="datetime-local" disabled={disabled} {...register('registration_opens_at')} />
          </Field>
          <Field label="Registration closes" htmlFor="event-reg-closes">
            <Input id="event-reg-closes" type="datetime-local" disabled={disabled} {...register('registration_closes_at')} />
          </Field>
          <Field label="Submission deadline" htmlFor="event-deadline">
            <Input id="event-deadline" type="datetime-local" disabled={disabled} {...register('submission_deadline_at')} />
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          Times are entered in your local zone and stored in UTC. Publishing validates that the
          required timing fields are present and ordered.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-rust">Location</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Venue name" htmlFor="event-venue">
            <Input id="event-venue" placeholder="Innovation Hall" disabled={disabled} {...register('venue_name')} />
          </Field>
          <Field label="City" htmlFor="event-city">
            <Input id="event-city" placeholder="Pune" disabled={disabled} {...register('city')} />
          </Field>
          <Field label="Address" htmlFor="event-address">
            <Input id="event-address" placeholder="12 MG Road" disabled={disabled} {...register('address')} />
          </Field>
          <Field label="Country" htmlFor="event-country">
            <Input id="event-country" placeholder="India" disabled={disabled} {...register('country')} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-rust">Teams</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Minimum team size"
            htmlFor="event-min-team"
            hint="At least 1."
            error={errors.min_team_size?.message}
            required
          >
            <Input id="event-min-team" type="number" min={1} disabled={disabled} {...register('min_team_size', { valueAsNumber: true })} />
          </Field>
          <Field
            label="Maximum team size"
            htmlFor="event-max-team"
            hint="Must be at least the minimum."
            error={errors.max_team_size?.message}
            required
          >
            <Input id="event-max-team" type="number" min={1} disabled={disabled} {...register('max_team_size', { valueAsNumber: true })} />
          </Field>
        </div>
      </section>
    </div>
  );
}
