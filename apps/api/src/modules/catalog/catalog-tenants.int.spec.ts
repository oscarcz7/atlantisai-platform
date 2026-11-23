import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  type BuildingConfigImportJson,
  TenantsService,
} from '../tenants/tenants.service.js';
import { CatalogService } from './catalog.service.js';

describe('Building Configurator & Seed integration (Spec 003)', () => {
  const prisma = new PrismaService();
  const tenantsService = new TenantsService(prisma);
  const catalogService = new CatalogService(prisma);

  const suffix = generateUuidV7().slice(0, 8);
  const testCode = `noah-cfg-${suffix}`;
  const cloneCode = `noah-clone-${suffix}`;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    }
    await prisma.$disconnect();
  });

  it('imports seed/noah.config.json idempotently, clones cleanly with RLS isolation, and enforces combo rules', async () => {
    const raw = readFileSync(resolve(process.cwd(), '../../seed/noah.config.json'), 'utf8');
    const parsed = JSON.parse(raw) as BuildingConfigImportJson;
    parsed.tenant.code = testCode;
    parsed.tenant.name = `Edificio Prueba ${suffix}`;

    // 1. Run import twice -> idempotent, zero duplicates
    const first = await tenantsService.importConfig(parsed, 'test-admin');
    createdTenantIds.push(first.tenantId);
    const second = await tenantsService.importConfig(parsed, 'test-admin');
    expect(second.tenantId).toBe(first.tenantId);

    const ctx: TenantContext = {
      tenantId: first.tenantId,
      actorType: 'STAFF',
      actorId: 'test-admin',
      channel: 'DASHBOARD',
      role: 'SUPERADMIN',
    };

    const [unitTypes, amenities, combos, parking] = await Promise.all([
      catalogService.listUnitTypes(ctx),
      catalogService.listAmenities(ctx),
      catalogService.listCleaningCombos(ctx),
      catalogService.getParkingConfig(ctx),
    ]);

    expect(unitTypes).toHaveLength(3);
    expect(amenities).toHaveLength(11);
    expect(combos).toHaveLength(4);
    expect(parking?.spots).toBe(4);

    // 2. Combo validation: reject amenity without cleaning fee
    const gym = amenities.find((a) => a.code === 'GYM')!;
    const bbq = amenities.find((a) => a.code === 'BBQ')!;
    const lounge = amenities.find((a) => a.code === 'LOUNGE')!;

    await expect(
      catalogService.createCleaningCombo(ctx, { amenityIds: [gym.id, bbq.id], feeCents: 4000 }),
    ).rejects.toMatchObject({ code: 'COMBO_REQUIRES_CLEANING_FEE' });

    // 3. Combo validation: reject duplicate set (BBQ + LOUNGE already exists in seed)
    await expect(
      catalogService.createCleaningCombo(ctx, { amenityIds: [lounge.id, bbq.id], feeCents: 5000 }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_COMBO' });

    // 4. Clone building into a new tenant
    const cloned = await tenantsService.cloneTenant(
      first.tenantId,
      { code: cloneCode, name: `Edificio Clon ${suffix}` },
      'test-admin',
    );
    createdTenantIds.push(cloned.id);

    const cloneCtx: TenantContext = { ...ctx, tenantId: cloned.id };
    const [clonedAmenities, clonedCombos] = await Promise.all([
      catalogService.listAmenities(cloneCtx),
      catalogService.listCleaningCombos(cloneCtx),
    ]);

    expect(clonedAmenities).toHaveLength(11);
    expect(clonedCombos).toHaveLength(4);
    // Verify cloned IDs are completely distinct from source IDs
    expect(clonedAmenities[0]?.id).not.toBe(amenities[0]?.id);
  });
});
