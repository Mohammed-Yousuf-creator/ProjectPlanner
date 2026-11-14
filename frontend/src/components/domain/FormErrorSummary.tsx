import type { FieldErrors, FieldValues } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';

/** Lists every client-side validation failure above a long form. */
export function FormErrorSummary<T extends FieldValues>({
  errors,
}: {
  errors: FieldErrors<T>;
}) {
  const entries = Object.entries(errors)
    .map(([field, error]) => {
      const message = (error as { message?: unknown } | undefined)?.message;
      return typeof message === 'string' ? { field, message } : null;
    })
    .filter((entry): entry is { field: string; message: string } => entry !== null);

  if (entries.length === 0) return null;

  return (
    <Alert tone="error" title={`Please fix ${entries.length} ${entries.length === 1 ? 'field' : 'fields'}`}>
      <ul className="list-disc space-y-0.5 pl-4">
        {entries.map((entry) => (
          <li key={entry.field}>
            <span className="font-mono text-[10px] uppercase tracking-wider">
              {entry.field.replace(/_/g, ' ')}
            </span>{' '}
            — {entry.message}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
