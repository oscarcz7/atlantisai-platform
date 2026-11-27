import { BadRequestException } from '@nestjs/common';

/** Parses an optional positive integer query param (e.g. ?limit=) with a hard upper bound. */
export function parseLimit(raw: string | undefined, fallback: number, max = 500): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException({ code: 'INVALID_LIMIT', message: 'El parámetro limit debe ser un entero positivo.' });
  }
  return Math.min(n, max);
}
