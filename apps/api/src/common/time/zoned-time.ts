/**
 * Server-side timezone helpers (Intl only). Dates are stored in UTC; calendar concepts such as
 * "current month" or "due day" are always resolved in the building's timezone (tenant.timezone).
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

function offsetMs(date: Date, timeZone: string): number {
  const p = wallParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Converts a wall-clock time in `timeZone` to the UTC instant. */
export function zonedWallTimeToUtc(
  wall: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour ?? 0, wall.minute ?? 0, wall.second ?? 0);
  const first = offsetMs(new Date(guess), timeZone);
  let utc = guess - first;
  const second = offsetMs(new Date(utc), timeZone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

/** `YYYY-MM` of `now` in `timeZone`. */
export function monthKeyInZone(now: Date, timeZone: string): string {
  const p = wallParts(now, timeZone);
  return `${p.year}-${pad(p.month)}`;
}

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) throw new RangeError(`Invalid month key: ${monthKey}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds `delta` months to a `YYYY-MM` key. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const idx = year * 12 + (month - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** UTC instant of the first moment of `monthKey` in `timeZone`. */
export function monthStartUtc(monthKey: string, timeZone: string): Date {
  const { year, month } = parseMonthKey(monthKey);
  return zonedWallTimeToUtc({ year, month, day: 1 }, timeZone);
}

/**
 * Due date of a monthly fee: `dueDay` of `billingMonth` (clamped to the month's last day)
 * at 23:59:59 in `timeZone`, as a UTC instant.
 */
export function monthlyFeeDueDate(billingMonth: string, dueDay: number, timeZone: string): Date {
  const { year, month } = parseMonthKey(billingMonth);
  const day = Math.min(Math.max(1, Math.trunc(dueDay)), daysInMonth(year, month));
  return zonedWallTimeToUtc({ year, month, day, hour: 23, minute: 59, second: 59 }, timeZone);
}

/** True if `timeZone` is a valid IANA zone for Intl. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
