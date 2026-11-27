import { describe, expect, it } from 'vitest';
import { computeParkingLiveStatus } from './parking-live.js';

const config = { freeMinutes: 180, overtimeFeeCentsPerHour: 150, alertMarginMinutes: 15 };
const checkIn = new Date('2026-11-23T10:00:00-05:00');
const at = (minutes: number) => new Date(checkIn.getTime() + minutes * 60_000);

describe('computeParkingLiveStatus', () => {
  it('is OK well inside the free window', () => {
    expect(computeParkingLiveStatus(checkIn, at(60), config)).toMatchObject({
      minutesParked: 60,
      remainingFreeMinutes: 120,
      overtimeMinutes: 0,
      overtimeCentsSoFar: 0,
      alertLevel: 'OK',
      alert: false,
    });
  });

  it('warns inside the configured margin', () => {
    expect(computeParkingLiveStatus(checkIn, at(165), config)).toMatchObject({ alertLevel: 'WARNING', alert: true, remainingFreeMinutes: 15 });
    expect(computeParkingLiveStatus(checkIn, at(164), config).alertLevel).toBe('OK');
    expect(computeParkingLiveStatus(checkIn, at(164), { ...config, alertMarginMinutes: 30 }).alertLevel).toBe('WARNING');
  });

  it('reports overtime and the amount that would be charged now', () => {
    expect(computeParkingLiveStatus(checkIn, at(181), config)).toMatchObject({
      alertLevel: 'OVERTIME',
      overtimeMinutes: 1,
      billedHoursSoFar: 1,
      overtimeCentsSoFar: 150,
    });
    expect(computeParkingLiveStatus(checkIn, at(270), config)).toMatchObject({ overtimeMinutes: 90, overtimeCentsSoFar: 300 });
  });
});
