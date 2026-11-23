import { describe, expect, it } from 'vitest';
import { buildComboKey, validateAmenityInput } from './catalog.validation.js';

describe('Catalog validations', () => {
  it('accepts valid amenity configuration', () => {
    expect(() =>
      validateAmenityInput({
        capacity: 20,
        maxDurationMinutes: 120,
        cleaningFeeCents: 0,
        schedule: { all: { open: '07:00', close: '23:00' } },
        frequency: { period: 'DAY', max: 1 },
      }),
    ).not.toThrow();
  });

  it('rejects capacity <= 0 and duration <= 0', () => {
    expect(() => validateAmenityInput({ capacity: 0, maxDurationMinutes: 60 })).toThrow();
    expect(() => validateAmenityInput({ capacity: 10, maxDurationMinutes: 0 })).toThrow();
  });

  it('rejects schedule where close <= open', () => {
    expect(() =>
      validateAmenityInput({
        capacity: 10,
        maxDurationMinutes: 60,
        schedule: { all: { open: '22:00', close: '08:00' } },
      }),
    ).toThrow();
  });

  it('rejects frequency max <= 0', () => {
    expect(() =>
      validateAmenityInput({
        capacity: 10,
        maxDurationMinutes: 60,
        frequency: { period: 'WEEK', max: 0 },
      }),
    ).toThrow();
  });

  it('produces order-independent canonical combo keys and rejects < 2 areas', () => {
    expect(buildComboKey(['b', 'a'])).toBe('a+b');
    expect(buildComboKey(['a', 'b'])).toBe('a+b');
    expect(() => buildComboKey(['a'])).toThrow();
  });
});
