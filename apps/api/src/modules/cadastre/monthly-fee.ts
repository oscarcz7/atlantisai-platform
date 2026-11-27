/**
 * Automatic monthly fee of a unit: area (m²) × building rate (cents per m²), rounded to the cent.
 * Returns 0 when the unit has no area or the building has no rate configured.
 */
export function computeAutoMonthlyFeeCents(areaSqm: number | null | undefined, feePerSqmCents: number | null | undefined): number {
  if (areaSqm === null || areaSqm === undefined || !(areaSqm > 0)) return 0;
  if (feePerSqmCents === null || feePerSqmCents === undefined || !(feePerSqmCents > 0)) return 0;
  return Math.round(areaSqm * feePerSqmCents);
}

/** Resolves the stored fee from the admin's intent (manual amount vs automatic). */
export function resolveUnitMonthlyFee(input: {
  /** Explicit amount entered by the admin (manual). */
  monthlyFeeCents?: number;
  /** 'AUTO' forces the automatic fee; 'MANUAL' requires monthlyFeeCents. */
  mode?: 'AUTO' | 'MANUAL';
  areaSqm: number | null;
  feePerSqmCents: number;
  /** Current state (updates only). */
  current?: { monthlyFeeCents: number; monthlyFeeIsManual: boolean };
}): { monthlyFeeCents: number; monthlyFeeIsManual: boolean } {
  if (input.mode === 'AUTO') {
    return { monthlyFeeCents: computeAutoMonthlyFeeCents(input.areaSqm, input.feePerSqmCents), monthlyFeeIsManual: false };
  }
  if (input.monthlyFeeCents !== undefined) {
    return { monthlyFeeCents: input.monthlyFeeCents, monthlyFeeIsManual: true };
  }
  if (input.current?.monthlyFeeIsManual) {
    return { monthlyFeeCents: input.current.monthlyFeeCents, monthlyFeeIsManual: true };
  }
  return { monthlyFeeCents: computeAutoMonthlyFeeCents(input.areaSqm, input.feePerSqmCents), monthlyFeeIsManual: false };
}
