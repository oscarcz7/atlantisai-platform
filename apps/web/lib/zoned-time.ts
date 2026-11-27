/**
 * Timezone helpers for the dashboard (no dependencies, Intl only).
 * Dates are stored in UTC; the UI shows and collects them in the building's timezone (`tenant.timezone`).
 */

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(date: Date, timeZone: string): WallParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset (ms) of `timeZone` from UTC at instant `date` (e.g. -18_000_000 for UTC-5). */
function offsetMs(date: Date, timeZone: string): number {
  const p = wallParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Converts a wall-clock date/time in `timeZone` to a UTC ISO string.
 * @param date `YYYY-MM-DD`
 * @param time `HH:mm` or `HH:mm:ss` (default `00:00`)
 */
export function zonedTimeToUtcIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0);
  const first = offsetMs(new Date(guess), timeZone);
  let utc = guess - first;
  const second = offsetMs(new Date(utc), timeZone);
  if (second !== first) utc = guess - second;
  return new Date(utc).toISOString();
}

/** "Today" (`YYYY-MM-DD`) in `timeZone`. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const p = wallParts(now, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Current month (`YYYY-MM`) in `timeZone`. */
export function currentMonthInZone(timeZone: string, now: Date = new Date()): string {
  return todayInZone(timeZone, now).slice(0, 7);
}

/** Local `YYYY-MM-DD` and `HH:mm` of a UTC instant in `timeZone` (for prefilling inputs). */
export function utcToZonedInputs(iso: string | Date, timeZone: string): { date: string; time: string } {
  const p = wallParts(typeof iso === 'string' ? new Date(iso) : iso, timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Adds `days` to a `YYYY-MM-DD` calendar date. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function formatDateTimeInZone(
  value: string | Date | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-EC', { ...options, timeZone }).format(date);
}

export function formatDateInZone(value: string | Date | null | undefined, timeZone: string): string {
  return formatDateTimeInZone(value, timeZone, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTimeInZone(value: string | Date | null | undefined, timeZone: string): string {
  return formatDateTimeInZone(value, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Spanish month label for a `YYYY-MM` key, e.g. "nov 2026". */
export function formatMonthKey(monthKey: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 15));
  return new Intl.DateTimeFormat('es-EC', { month: style, year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** Short month-only label for a `YYYY-MM` key, e.g. "Nov". */
export function formatMonthOnly(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-EC', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 15)))
    .replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
