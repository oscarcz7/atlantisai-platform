import { describe, expect, it } from 'vitest';
import { sanitizeAuditPayload } from './cadastre.service.js';

describe('sanitizeAuditPayload', () => {
  it('drops encrypted/hashed national IDs and masks contact data', () => {
    const out = sanitizeAuditPayload({
      id: 'p1',
      fullName: 'Ana',
      nationalIdEnc: 'iv.tag.data',
      nationalIdHash: 'abc',
      nationalIdMask: '******5678',
      waPhone: '593987654321',
      email: 'ana@example.com',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }) as Record<string, unknown>;
    expect(out).not.toHaveProperty('nationalIdEnc');
    expect(out).not.toHaveProperty('nationalIdHash');
    expect(out['nationalIdMask']).toBe('******5678');
    expect(out['waPhone']).toBe('********4321');
    expect(out['email']).toBe('a***@example.com');
    expect(out['createdAt']).toBe('2026-01-01T00:00:00.000Z');
  });
});
