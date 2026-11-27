import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from './prisma.service.js';
import { FieldEncryptionService } from '../../modules/auth/crypto/field-encryption.service.js';
import { BillingService } from '../../modules/billing/billing.service.js';
import { CadastreService } from '../../modules/cadastre/cadastre.service.js';
import { CatalogService } from '../../modules/catalog/catalog.service.js';
import { VisitsService } from '../../modules/visits/visits.service.js';

describe('cross-tenant references are rejected (FK checks bypass RLS)', () => {
  const prisma = new PrismaService();
  const enc = new FieldEncryptionService();
  const catalog = new CatalogService(prisma);
  const cadastre = new CadastreService(prisma, enc);
  const billing = new BillingService(prisma);
  const visits = new VisitsService(prisma, enc);
  const a = generateUuidV7();
  const b = generateUuidV7();
  const ctx = (tenantId: string): TenantContext => ({
    tenantId,
    actorType: 'STAFF',
    actorId: 'test',
    channel: 'DASHBOARD',
    role: 'SUPERADMIN',
  });
  let typeA = '';
  let unitB = '';
  let personA = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: a, code: `xa-${a.slice(0, 8)}`, name: 'X A' },
        { id: b, code: `xb-${b.slice(0, 8)}`, name: 'X B' },
      ],
    });
    typeA = (await catalog.upsertUnitType(ctx(a), { code: 'TA', name: 'Tipo A', includedGuests: 2 })).id;
    const typeB = (await catalog.upsertUnitType(ctx(b), { code: 'TB', name: 'Tipo B', includedGuests: 2 })).id;
    unitB = (await cadastre.createUnit(ctx(b), { number: '101', floor: 1, unitTypeId: typeB, monthlyFeeCents: 100 })).id;
    personA = (await cadastre.createPerson(ctx(a), { fullName: 'Persona A', nationalId: '1700000001', waPhone: '0987000001' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [a, b] } } });
    await prisma.$disconnect();
  });

  it('blocks linking B records to A ids', async () => {
    await expect(cadastre.updateUnit(ctx(b), unitB, { unitTypeId: typeA })).rejects.toMatchObject({
      code: 'UNIT_TYPE_NOT_FOUND',
    });
    await expect(
      cadastre.createOccupancy(ctx(b), {
        personId: personA,
        unitId: unitB,
        role: 'OWNER_RESIDENT',
        validFrom: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
  });

  it('blocks money/visits against another tenant unit', async () => {
    await expect(
      billing.recordDepositMovement(ctx(a), { unitId: unitB, type: 'DEPOSIT', amountCents: 100, reason: 'x' }),
    ).rejects.toMatchObject({ code: 'UNIT_NOT_FOUND' });
    await expect(
      billing.submitPaymentProof(ctx(a), {
        unitId: unitB,
        fileKey: 'f',
        bank: 'b',
        amountCents: 100,
        transferDate: '2026-01-01T00:00:00Z',
        reference: 'r',
      }),
    ).rejects.toMatchObject({ code: 'UNIT_NOT_FOUND' });
    await expect(
      visits.registerVisit(ctx(a), {
        hostUnitId: unitB,
        visitorName: 'V',
        nationalId: '1700000002',
        needsParking: false,
        expectedAt: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'UNIT_NOT_FOUND' });
  });
});
