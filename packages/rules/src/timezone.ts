export interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly dayOfWeek: number; // 1 = Monday ... 7 = Sunday
  readonly dayKey: string; // YYYY-MM-DD
  readonly monthKey: string; // YYYY-MM
  readonly weekKey: string; // Monday YYYY-MM-DD
}

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export function getLocalDateParts(date: Date, timezone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const dayOfWeek = WEEKDAY_MAP[get('weekday')] ?? 1;

  const pad = (n: number) => String(n).padStart(2, '0');
  const dayKey = `${year}-${pad(month)}-${pad(day)}`;
  const monthKey = `${year}-${pad(month)}`;

  // Compute Monday of the local calendar week (Monday-Sunday)
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() - (dayOfWeek - 1));
  const weekKey = `${utcDate.getUTCFullYear()}-${pad(utcDate.getUTCMonth() + 1)}-${pad(utcDate.getUTCDate())}`;

  return { year, month, day, hour, minute, dayOfWeek, dayKey, monthKey, weekKey };
}

export function getLocalDayName(parts: LocalDateParts): string {
  const idx = parts.dayOfWeek === 7 ? 0 : parts.dayOfWeek;
  return DAY_NAMES[idx] ?? 'MON';
}

export function parseHhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
