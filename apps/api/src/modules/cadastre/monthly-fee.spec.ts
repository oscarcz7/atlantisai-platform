import { describe, expect, it } from 'vitest';
import { computeAutoMonthlyFeeCents, resolveUnitMonthlyFee } from './monthly-fee.js';

describe('computeAutoMonthlyFeeCents', () => {
  it('multiplies area by rate and rounds to the cent', () => {
    expect(computeAutoMonthlyFeeCents(85.5, 300)).toBe(25650);
    expect(computeAutoMonthlyFeeCents(33.335, 300)).toBe(10001);
  });

  it('returns 0 without area or rate', () => {
    expect(computeAutoMonthlyFeeCents(null, 300)).toBe(0);
    expect(computeAutoMonthlyFeeCents(0, 300)).toBe(0);
    expect(computeAutoMonthlyFeeCents(80, 0)).toBe(0);
  });
});

describe('resolveUnitMonthlyFee', () => {
  it('an explicit amount is manual', () => {
    expect(resolveUnitMonthlyFee({ monthlyFeeCents: 12000, areaSqm: 80, feePerSqmCents: 300 })).toEqual({
      monthlyFeeCents: 12000,
      monthlyFeeIsManual: true,
    });
  });

  it('no amount on create = automatic', () => {
    expect(resolveUnitMonthlyFee({ areaSqm: 80, feePerSqmCents: 300 })).toEqual({
      monthlyFeeCents: 24000,
      monthlyFeeIsManual: false,
    });
  });

  it('AUTO clears a manual fee and recalculates', () => {
    expect(
      resolveUnitMonthlyFee({
        mode: 'AUTO',
        areaSqm: 80,
        feePerSqmCents: 300,
        current: { monthlyFeeCents: 12000, monthlyFeeIsManual: true },
      }),
    ).toEqual({ monthlyFeeCents: 24000, monthlyFeeIsManual: false });
  });

  it('keeps a manual fee when the area changes without new intent', () => {
    expect(
      resolveUnitMonthlyFee({
        areaSqm: 100,
        feePerSqmCents: 300,
        current: { monthlyFeeCents: 12000, monthlyFeeIsManual: true },
      }),
    ).toEqual({ monthlyFeeCents: 12000, monthlyFeeIsManual: true });
  });

  it('recalculates an automatic fee when the area changes', () => {
    expect(
      resolveUnitMonthlyFee({
        areaSqm: 100,
        feePerSqmCents: 300,
        current: { monthlyFeeCents: 24000, monthlyFeeIsManual: false },
      }),
    ).toEqual({ monthlyFeeCents: 30000, monthlyFeeIsManual: false });
  });
});
