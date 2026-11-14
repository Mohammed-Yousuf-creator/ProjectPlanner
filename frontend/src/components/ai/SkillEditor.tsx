import { useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import type { SkillCreate } from '@/api/types';

const PROFICIENCY_LABELS: Record<number, string> = {
  1: 'Learning',
  2: 'Basic',
  3: 'Comfortable',
  4: 'Strong',
  5: 'Expert',
};

const MAX_SKILLS = 50;
const MAX_LENGTH = 80;

export type EditableSkill = SkillCreate;

/**
 * Chip-style skill editor.
 *
 * Why chips instead of a free-text comma list: the server normalises and
 * de-duplicates, so "React" and "react.js" collapse to one skill. Showing chips
 * makes that visible immediately, which prevents the confusing case where a user
 * types five skills and only gets three back.
 *
 * Enter or comma adds; Backspace on an empty box removes the last chip.
 */
export function SkillEditor({
  value,
  onChange,
  disabled,
  error,
}: {
  value: EditableSkill[];
  onChange: (next: EditableSkill[]) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const [draft, setDraft] = useState('');
  const [level, setLevel] = useState(3);

  const existing = new Set(value.map((skill) => skill.label.trim().toLowerCase()));

  const add = () => {
    const label = draft.trim();
    if (!label || label.length > MAX_LENGTH) return;
    if (existing.has(label.toLowerCase())) {
      setDraft('');
      return;
    }
    if (value.length >= MAX_SKILLS) return;
    onChange([...value, { label, proficiency: level }]);
    setDraft('');
    setLevel(3);
  };

  const remove = (label: string) => {
    onChange(value.filter((skill) => skill.label !== label));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Prevent Enter from submitting the surrounding form.
      event.preventDefault();
      add();
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <Field
        label="Add a skill"
        htmlFor="skill-input"
        error={error}
        hint="Press Enter to add. Spelling variants like “React.js” are merged with “React” automatically."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="skill-input"
            value={draft}
            disabled={disabled}
            maxLength={MAX_LENGTH}
            placeholder="e.g. TypeScript"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            className="max-w-xs"
          />
          <select
            aria-label="Proficiency"
            value={level}
            disabled={disabled}
            onChange={(event) => setLevel(Number(event.target.value))}
            className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest disabled:opacity-60"
          >
            {Object.entries(PROFICIENCY_LABELS).map(([numeric, label]) => (
              <option key={numeric} value={numeric}>
                {label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={add}
            disabled={disabled || !draft.trim() || value.length >= MAX_SKILLS}
            icon={<Plus className="h-3 w-3" aria-hidden="true" />}
          >
            Add
          </Button>
        </div>
      </Field>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Your skills">
          {value.map((skill) => (
            <li key={skill.label}>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas',
                  'py-1 pl-2.5 pr-1.5 text-[11px] font-semibold text-ink',
                )}
              >
                {skill.label}
                <span className="font-mono text-[9px] font-normal uppercase tracking-wider text-muted">
                  {PROFICIENCY_LABELS[skill.proficiency ?? 3]}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(skill.label)}
                  className="rounded p-0.5 text-muted transition-colors hover:bg-hover-stone hover:text-rust focus:outline-none focus-visible:ring-1 focus-visible:ring-forest disabled:opacity-50"
                  aria-label={`Remove ${skill.label}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted">
          No skills yet. Add three or four and matchmaking starts suggesting teammates.
        </p>
      )}
    </div>
  );
}
