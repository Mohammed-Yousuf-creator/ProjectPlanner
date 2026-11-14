import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EVENT_FORMATS, EVENT_TYPE_SUGGESTIONS } from '@/lib/constants';

export type EventFilterValues = {
  event_type: string;
  format: string;
  city: string;
};

/**
 * Filter bar for public discovery. State is owned by the URL (see EventsPage),
 * so this component is fully controlled and stateless.
 */
export function EventFilters({
  values,
  onChange,
  onReset,
  hasActiveFilters,
}: {
  values: EventFilterValues;
  onChange: (patch: Partial<EventFilterValues>) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <Field label="Event type" htmlFor="filter-event-type">
        <Select
          id="filter-event-type"
          value={values.event_type}
          onChange={(event) => onChange({ event_type: event.target.value })}
          placeholder="Any type"
          options={EVENT_TYPE_SUGGESTIONS.map((type) => ({
            value: type,
            label: type.charAt(0).toUpperCase() + type.slice(1),
          }))}
        />
      </Field>

      <Field label="Format" htmlFor="filter-format">
        <Select
          id="filter-format"
          value={values.format}
          onChange={(event) => onChange({ format: event.target.value })}
          placeholder="Any format"
          options={EVENT_FORMATS.map((format) => ({ value: format.value, label: format.label }))}
        />
      </Field>

      <Field label="City" htmlFor="filter-city">
        <Input
          id="filter-city"
          value={values.city}
          placeholder="e.g. Pune"
          onChange={(event) => onChange({ city: event.target.value })}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button variant="chip" onClick={onReset} disabled={!hasActiveFilters}>
          Reset filters
        </Button>
      </div>
    </div>
  );
}
