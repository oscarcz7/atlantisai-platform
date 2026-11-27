import { describe, expect, it } from 'vitest';
import { resolveMonthlyFeePeriod, summarizeMonthlyBalance } from './monthly-fees.js';

const TZ = 'America/Guayaquil';

describe('resolveMonthlyFeePeriod', () => {
  it('defaults to the building month on the 31st at 20:00 Guayaquil (UTC is already next month)', () => {
    const res = resolveMonthlyFeePeriod({
      timeZone: TZ,
      dueDay: 10,
      now: new Date('2026-10-31T20:00:00-05:00'),
    });
    expect(res.billingMonth).toBe('2026-10');
    expect(res.dueDate.toISOString()).toBe('2026-10-11T04:59:59.000Z'); // 10/10 23:59:59 -05:00
  });

  it('uses the configured due day and clamps it to the month length', () => {
    const res = resolveMonthlyFeePeriod({ billingMonth: '2027-02', timeZone: TZ, dueDay: 31, now: new Date() });
    expect(res.dueDate.toISOString()).toBe('2027-03-01T04:59:59.000Z'); // 28/02 23:59:59 -05:00
  });

  it('respects explicit billingMonth and dueDate', () => {
    const res = resolveMonthlyFeePeriod({
      billingMonth: '2026-12',
      dueDate: '2026-12-15T05:00:00.000Z',
      timeZone: TZ,
      dueDay: 10,
      now: new Date(),
    });
    expect(res).toEqual({ billingMonth: '2026-12', dueDate: new Date('2026-12-15T05:00:00.000Z') });
  });

  it('rejects when there is no due day configured and none is given', () => {
    expect(() => resolveMonthlyFeePeriod({ timeZone: TZ, dueDay: null, now: new Date() })).toThrow(
      expect.objectContaining({ code: 'SETTINGS_NOT_CONFIGURED' }),
    );
  });

  it('rejects malformed months', () => {
    expect(() => resolveMonthlyFeePeriod({ billingMonth: '2026-13', timeZone: TZ, dueDay: 10, now: new Date() })).toThrow(
      expect.objectContaining({ code: 'INVALID_BILLING_MONTH' }),
    );
  });
});

describe('summarizeMonthlyBalance', () => {
  it('groups billed fees by billing month and payments by local registration month', () => {
    const rows = summarizeMonthlyBalance(
      [
        { type: 'MONTHLY_FEE', amountCents: 10000, reference: 'MONTHLY_FEE:2026-10:u1', dueDate: null, createdAt: new Date('2026-11-02T00:00:00Z') },
        { type: 'MONTHLY_FEE', amountCents: 5000, reference: 'MONTHLY_FEE:2026-11:u1', dueDate: null, createdAt: new Date('2026-11-02T00:00:00Z') },
        // Fallback to due date when the reference has no month
        { type: 'MONTHLY_FEE', amountCents: 700, reference: null, dueDate: new Date('2026-11-11T04:59:59Z'), createdAt: new Date('2026-11-01T06:00:00Z') },
        // 31 Oct 20:00 Guayaquil = 1 Nov 01:00 UTC -> October in the building
        { type: 'PAYMENT', amountCents: -3000, reference: null, dueDate: null, createdAt: new Date('2026-11-01T01:00:00Z') },
        { type: 'PAYMENT', amountCents: -2000, reference: null, dueDate: null, createdAt: new Date('2026-11-15T15:00:00Z') },
        { type: 'CLEANING', amountCents: 999, reference: null, dueDate: null, createdAt: new Date('2026-11-15T15:00:00Z') },
        // Out of range month ignored
        { type: 'MONTHLY_FEE', amountCents: 1, reference: 'MONTHLY_FEE:2025-01:u1', dueDate: null, createdAt: new Date('2025-01-02T00:00:00Z') },
      ],
      ['2026-10', '2026-11'],
      TZ,
    );
    expect(rows).toEqual([
      { month: '2026-10', billedCents: 10000, collectedCents: 3000 },
      { month: '2026-11', billedCents: 5700, collectedCents: 2000 },
    ]);
  });
});
