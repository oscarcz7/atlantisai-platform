import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FieldEncryptionService } from '../auth/crypto/field-encryption.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { CadastreService } from './cadastre.service.js';

describe('Cadastre integration (Spec 004)', () => {
  const prisma = new PrismaService();
  const encryption = new FieldEncryptionService();
  const catalogService = new CatalogService(prisma);
  const cadastreService = new CadastreService(prisma, encryption);

  const tenantId = generateUuidV7();
  const ctx: TenantContext = {
    tenantId,
    actorType: 'STAFF',
    actorId: 'test-admin',
    channel: 'DASHBOARD',
    role: 'ADMIN',
  };

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.create({
      data: { id: tenantId, code: `cad-${tenantId.slice(0, 8)}`, name: 'Edificio Catastro Test' },
    });
    await catalogService.upsertUnitType(ctx, { code: 'SUITE', name: 'Suite', includedGuests: 3 });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('encrypts national IDs, enforces unique WhatsApp phone, demotes owner when leased, and supports validated import', async () => {
    const unitTypes = await catalogService.listUnitTypes(ctx);
    const suite = unitTypes[0]!;

    const unit = await cadastreService.createUnit(ctx, {
      number: '402',
      floor: 4,
      unitTypeId: suite.id,
      monthlyFeeCents: 12000,
    });

    const owner = await cadastreService.createPerson(ctx, {
      fullName: 'María Propietaria',
      nationalId: '1712345678',
      waPhone: '0984555922',
      email: 'maria@example.com',
    });
    expect(owner.nationalId).toBe('17****5678');
    expect(owner.waPhone).toBe('+593984555922');

    // Duplicate WhatsApp phone in same building must fail
    await expect(
      cadastreService.createPerson(ctx, {
        fullName: 'Otra Persona',
        nationalId: '1799999999',
        waPhone: '+593 98 455 5922',
      }),
    ).rejects.toMatchObject({ code: 'PHONE_ALREADY_ASSIGNED' });

    const renter = await cadastreService.createPerson(ctx, {
      fullName: 'Carlos Arrendatario',
      nationalId: '1700001111',
      waPhone: '0991112233',
    });

    await cadastreService.createOccupancy(ctx, {
      personId: owner.id,
      unitId: unit.id,
      role: 'OWNER_RESIDENT',
      validFrom: '2026-01-01T00:00:00Z',
    });
    await cadastreService.createOccupancy(ctx, {
      personId: renter.id,
      unitId: unit.id,
      role: 'LONG_TERM_TENANT',
      validFrom: '2026-05-01T00:00:00Z',
      validTo: '2026-12-01T00:00:00Z',
    });

    const detail = await cadastreService.getUnitDetail(ctx, unit.id, new Date('2026-06-15T00:00:00Z'));
    const ownerRole = detail.effectiveRoles.find((r) => r.personId === owner.id);
    const renterRole = detail.effectiveRoles.find((r) => r.personId === renter.id);
    expect(ownerRole?.effectiveRole).toBe('OWNER_LANDLORD');
    expect(renterRole?.effectiveRole).toBe('LONG_TERM_TENANT');

    // Bulk import preview detects errors and confirms clean rows
    const badPreview = await cadastreService.previewImport(ctx, [
      {
        unitNumber: '501',
        floor: 5,
        unitTypeCode: 'INVALID_TYPE',
        personFullName: 'Ana',
        nationalId: '1711112222',
        waPhone: '0987654321',
        role: 'OWNER_RESIDENT',
        validFrom: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(badPreview.errorCount).toBe(1);

    const imported = await cadastreService.confirmImport(ctx, [
      {
        unitNumber: '501',
        floor: 5,
        unitTypeCode: 'SUITE',
        monthlyFeeCents: 12000,
        personFullName: 'Ana Importada',
        nationalId: '1711112222',
        waPhone: '0987654321',
        role: 'OWNER_RESIDENT',
        validFrom: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(imported.imported).toBe(1);
  });
});
