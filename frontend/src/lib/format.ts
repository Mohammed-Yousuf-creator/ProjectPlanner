import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

/** Parse an API timestamp (always UTC ISO-8601) into a local Date. */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

/** e.g. "14 Nov 2026, 18:30" in the viewer's local timezone. */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseApiDate(value);
  return date ? format(date, 'dd MMM yyyy, HH:mm') : '—';
}

/** e.g. "14 Nov 2026" */
export function formatDate(value: string | null | undefined): string {
  const date = parseApiDate(value);
  return date ? format(date, 'dd MMM yyyy') : '—';
}

/** e.g. "14 Nov 2026" but falling back to a dash only for empty input. */
export function formatDayMonth(value: string | null | undefined): string {
  const date = parseApiDate(value);
  return date ? format(date, 'dd MMM') : '—';
}

/** e.g. "2 hours ago" */
export function formatRelative(value: string | null | undefined): string {
  const date = parseApiDate(value);
  return date ? formatDistanceToNowStrict(date, { addSuffix: true }) : '—';
}

/** For `<input type="datetime-local">` - converts UTC ISO to local wall time. */
export function toDateTimeLocal(value: string | null | undefined): string {
  const date = parseApiDate(value);
  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

/**
 * Converts a `<input type="datetime-local">` wall-clock string into a UTC ISO
 * string. Never send the naive local string to the server.
 */
export function fromDateTimeLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return isValid(date) ? date.toISOString() : null;
}

/** Groups ISO timestamps into local-date buckets, preserving chronological order. */
export function groupByLocalDate<T>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
): { key: string; label: string; items: T[] }[] {
  const buckets = new Map<string, { key: string; label: string; items: T[]; sortKey: number }>();

  for (const item of items) {
    const date = parseApiDate(getDate(item));
    const key = date ? format(date, 'yyyy-MM-dd') : 'unscheduled';
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(key, {
        key,
        label: date ? format(date, 'EEEE, dd MMM yyyy') : 'Date to be announced',
        items: [item],
        sortKey: date ? date.getTime() : Number.MAX_SAFE_INTEGER,
      });
    }
  }

  return [...buckets.values()].sort((a, b) => a.sortKey - b.sortKey);
}

/**
 * Formats money using the record's own currency code - never a hardcoded symbol.
 * API decimals arrive as strings ("1500.00"); accept both.
 */
export function formatCurrency(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
  options: { compact?: boolean } = {},
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(numeric)) return '—';
  const code = (currency ?? 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: options.compact ? 0 : 2,
      notation: options.compact ? 'compact' : 'standard',
    }).format(numeric);
  } catch {
    return `${code} ${numeric.toFixed(2)}`;
  }
}

/** Human byte size for uploads/previews. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/** Formats a numeric score with fixed precision, or an em dash when absent. */
export function formatScore(score: number | null | undefined, digits = 2): string {
  if (score === null || score === undefined) return '—';
  return score.toFixed(digits);
}

/** Title-cases a snake_case enum value: "seeking_sponsors" -> "seeking sponsors". */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ');
}

/** Renders a date range like "14 Nov 2026, 09:00 → 16 Nov 2026, 18:00". */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return 'Dates to be announced';
  if (start && !end) return `Starts ${formatDateTime(start)}`;
  if (!start && end) return `Ends ${formatDateTime(end)}`;
  return `${formatDateTime(start)} → ${formatDateTime(end)}`;
}

/**
 * Returns true only for http(s) URLs so we never render `javascript:` links.
 */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Initials for the avatar fallback: "Ada Lovelace" -> "AL". */
export function getInitials(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  }
  return '?';
}
