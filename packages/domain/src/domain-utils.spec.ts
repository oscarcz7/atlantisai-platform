import { describe, expect, it } from 'vitest';
import {
  DomainError,
  REJECTION_CODES,
  REJECTION_MESSAGES_ES,
  formatUsdCents,
  generateUuidV7,
} from './index.js';

describe('@noah/domain', () => {
  it('generates valid RFC 9562 UUID v7 identifiers', () => {
    const id = generateUuidV7(1_732_360_000_000);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('has a Spanish message for every rejection code', () => {
    for (const code of Object.values(REJECTION_CODES)) {
      expect(REJECTION_MESSAGES_ES[code]).toBeTruthy();
    }
  });

  it('formats cents in USD with comma decimals', () => {
    expect(formatUsdCents(5000)).toBe('USD 50,00');
    expect(formatUsdCents(150)).toBe('USD 1,50');
    expect(formatUsdCents(-2505)).toBe('-USD 25,05');
  });

  it('creates DomainError with code and statusCode', () => {
    const err = new DomainError('SLOT_TAKEN', REJECTION_MESSAGES_ES.SLOT_TAKEN, 409);
    expect(err.code).toBe('SLOT_TAKEN');
    expect(err.statusCode).toBe(409);
  });
});
