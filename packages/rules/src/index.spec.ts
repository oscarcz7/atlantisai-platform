import { describe, expect, it } from 'vitest';
import { calculateParkingOvertime } from './index.js';

describe('@noah/rules smoke', () => {
  it('calculates zero fee within free minutes', () => {
    const start = new Date('2026-11-23T10:00:00Z');
    const end = new Date('2026-11-23T12:30:00Z');
    const result = calculateParkingOvertime(start, end, {
      freeMinutes: 180,
      overtimeFeeCentsPerHour: 150,
    });
    expect(result).toEqual({ overtimeMinutes: 0, billedHours: 0, feeCents: 0 });
  });

  it('rounds overtime up to full hours', () => {
    const start = new Date('2026-11-23T10:00:00Z');
    const end = new Date('2026-11-23T14:30:00Z');
    const result = calculateParkingOvertime(start, end, {
      freeMinutes: 180,
      overtimeFeeCentsPerHour: 150,
    });
    expect(result).toEqual({ overtimeMinutes: 90, billedHours: 2, feeCents: 300 });
  });
});
