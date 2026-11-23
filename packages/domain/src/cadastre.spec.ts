import { describe, expect, it } from 'vitest';
import { maskNationalId, normalizeEcuadorPhone, resolveEffectiveRole } from './cadastre.js';

describe('@noah/domain cadastre helpers', () => {
  const unitId = 'unit-1';
  const ownerId = 'owner-1';
  const tenantId = 'tenant-1';

  it('resolves OWNER_RESIDENT when no long-term tenant is active', () => {
    const role = resolveEffectiveRole(
      ownerId,
      [{ personId: ownerId, unitId, role: 'OWNER_RESIDENT', validFrom: new Date('2026-01-01T00:00:00Z') }],
      new Date('2026-06-01T12:00:00Z'),
    );
    expect(role).toBe('OWNER_RESIDENT');
  });

  it('demotes OWNER_RESIDENT to OWNER_LANDLORD while a LONG_TERM_TENANT is active', () => {
    const occupancies = [
      { personId: ownerId, unitId, role: 'OWNER_RESIDENT' as const, validFrom: new Date('2026-01-01T00:00:00Z') },
      {
        personId: tenantId,
        unitId,
        role: 'LONG_TERM_TENANT' as const,
        validFrom: new Date('2026-03-01T00:00:00Z'),
        validTo: new Date('2026-09-01T00:00:00Z'),
      },
    ];

    expect(resolveEffectiveRole(ownerId, occupancies, new Date('2026-06-01T00:00:00Z'))).toBe(
      'OWNER_LANDLORD',
    );
    expect(resolveEffectiveRole(tenantId, occupancies, new Date('2026-06-01T00:00:00Z'))).toBe(
      'LONG_TERM_TENANT',
    );
    // After lease expires, owner regains OWNER_RESIDENT and tenant loses access
    expect(resolveEffectiveRole(ownerId, occupancies, new Date('2026-09-02T00:00:00Z'))).toBe(
      'OWNER_RESIDENT',
    );
    expect(resolveEffectiveRole(tenantId, occupancies, new Date('2026-09-02T00:00:00Z'))).toBeNull();
  });

  it('normalizes Ecuadorian phones to E.164 and rejects invalid numbers', () => {
    expect(normalizeEcuadorPhone('0984555922')).toBe('+593984555922');
    expect(normalizeEcuadorPhone('+593 95-984-6694')).toBe('+593959846694');
    expect(() => normalizeEcuadorPhone('12345')).toThrow();
  });

  it('masks national IDs safely', () => {
    expect(maskNationalId('1712345678')).toBe('17****5678');
  });
});
