import { describe, expect, it } from 'vitest';
import {
  isValidTimeZone,
  monthKeyInZone,
  monthStartUtc,
  monthlyFeeDueDate,
  shiftMonthKey,
  zonedWallTimeToUtc,
} from './zoned-time.js';

describe('zoned-time', () => {
  it('converts a wall time in a fixed-offset zone to UTC', () => {
    expect(
      zonedWallTimeToUtc({ year: 2026, month: 12, day: 10, hour: 23, minute: 59, second: 59 }, 'America/Guayaquil').toISOString(),
    ).toBe('2026-12-11T04:59:59.000Z');
  });

  it('handles DST zones on both sides of the transition', () => {
    // New York: EDT (UTC-4) in July, EST (UTC-5) in January
    expect(zonedWallTimeToUtc({ year: 2026, month: 7, day: 1, hour: 12 }, 'America/New_York').toISOString()).toBe(
      '2026-07-01T16:00:00.000Z',
    );
    expect(zonedWallTimeToUtc({ year: 2026, month: 1, day: 1, hour: 12 }, 'America/New_York').toISOString()).toBe(
      '2026-01-01T17:00:00.000Z',
    );
  });

  it('resolves the current month in the building timezone, not UTC (31st at 20:00 Guayaquil)', () => {
    const now = new Date('2026-10-31T20:00:00-05:00'); // = 2026-11-01T01:00Z
    expect(now.toISOString().slice(0, 7)).toBe('2026-11');
    expect(monthKeyInZone(now, 'America/Guayaquil')).toBe('2026-10');
    expect(monthKeyInZone(now, 'UTC')).toBe('2026-11');
  });

  it('computes the due date clamped to the last day of the month', () => {
    expect(monthlyFeeDueDate('2026-10', 10, 'America/Guayaquil').toISOString()).toBe('2026-10-11T04:59:59.000Z');
    expect(monthlyFeeDueDate('2026-02', 31, 'America/Guayaquil').toISOString()).toBe('2026-03-01T04:59:59.000Z');
    expect(monthlyFeeDueDate('2028-02', 30, 'UTC').toISOString()).toBe('2028-02-29T23:59:59.000Z');
  });

  it('shifts month keys across years and computes month starts', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-11', 2)).toBe('2027-01');
    expect(shiftMonthKey('2026-06', -5)).toBe('2026-01');
    expect(monthStartUtc('2026-11', 'America/Guayaquil').toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });

  it('validates IANA zones', () => {
    expect(isValidTimeZone('America/Guayaquil')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
