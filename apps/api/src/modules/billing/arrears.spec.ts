import { describe, expect, it } from 'vitest';
import { computeArrearsMonths, reservationLedgerRef } from './arrears.js';

const now = new Date('2026-11-23T00:00:00Z');
const fee = (month: string, cents = 10000) => ({
  type: 'MONTHLY_FEE',
  amountCents: cents,
  dueDate: new Date(`${month}-10T00:00:00Z`),
  reference: `MONTHLY_FEE:${month}:u1`,
});

describe('computeArrearsMonths', () => {
  it('counts overdue fees not covered by general payments (oldest first)', () => {
    const entries = [fee('2026-08'), fee('2026-09'), fee('2026-10'), { type: 'PAYMENT', amountCents: -10000, dueDate: null, reference: 'TRF-1' }];
    expect(computeArrearsMonths(entries, now)).toBe(2);
  });

  it('a cleaning payment netted against its reservation charge does NOT reduce arrears', () => {
    const r = reservationLedgerRef('r1');
    const entries = [
      fee('2026-09'),
      fee('2026-10'),
      { type: 'CLEANING', amountCents: 5000, dueDate: null, reference: r },
      { type: 'PAYMENT', amountCents: -5000, dueDate: null, reference: r },
    ];
    expect(computeArrearsMonths(entries, now)).toBe(2);
  });

  it('pending extra-guest charges are not monthly arrears, and a reservation surplus becomes credit', () => {
    const r = reservationLedgerRef('r2');
    const entries = [
      fee('2026-10'),
      { type: 'EXTRA_GUEST', amountCents: 500, dueDate: null, reference: r },
      { type: 'CLEANING', amountCents: 5000, dueDate: null, reference: r },
      { type: 'PAYMENT', amountCents: -15500, dueDate: null, reference: r },
    ];
    expect(computeArrearsMonths(entries, now)).toBe(0);
    expect(computeArrearsMonths(entries.slice(0, 3), now)).toBe(1);
  });

  it('ignores fees not yet due', () => {
    expect(computeArrearsMonths([fee('2026-12')], now)).toBe(0);
  });
});
