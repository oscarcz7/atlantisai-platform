import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FieldEncryptionService } from '../auth/crypto/field-encryption.service.js';
import { CadastreService } from '../cadastre/cadastre.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import {
  type BuildingConfigImportJson,
  TenantsService,
} from '../tenants/tenants.service.js';
import { ReservationsService } from './reservations.service.js';

describe('Reservations integration: rules, concurrency, idempotency, expiration (Spec 006)', () => {
  const prisma = new PrismaService();
  const encryption = new FieldEncryptionService();
  const tenantsService = new TenantsService(prisma);
  const catalogService = new CatalogService(prisma);
  const cadastreService = new CadastreService(prisma, encryption);
  const reservationsService = new ReservationsService(prisma);

  const suffix = generateUuidV7().slice(0, 8);
  let tenantId = '';
  let ctx: TenantContext;
  let unit1Id = '';
  let unit2Id = '';
  let owner1Id = '';
  let owner2Id = '';
  let gymId = '';
  let bbqId = '';
  let loungeId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const raw = readFileSync(resolve(process.cwd(), '../../seed/noah.config.json'), 'utf8');
    const parsed = JSON.parse(raw) as BuildingConfigImportJson;
    parsed.tenant.code = `res-${suffix}`;
    parsed.tenant.name = `Edificio Reservas ${suffix}`;

    const imported = await tenantsService.importConfig(parsed, 'test-admin');
    tenantId = imported.tenantId;
    ctx = {
      tenantId,
      actorType: 'STAFF',
      actorId: 'test-admin',
      channel: 'DASHBOARD',
      role: 'ADMIN',
    };

    const [unitTypes, amenities] = await Promise.all([
      catalogService.listUnitTypes(ctx),
      catalogService.listAmenities(ctx),
    ]);
    const suite = unitTypes.find((ut) => ut.code === 'SUITE')!;
    gymId = amenities.find((a) => a.code === 'GYM')!.id;
    bbqId = amenities.find((a) => a.code === 'BBQ')!.id;
    loungeId = amenities.find((a) => a.code === 'LOUNGE')!.id;

    const u1 = await cadastreService.createUnit(ctx, {
      number: '301',
      floor: 3,
      unitTypeId: suite.id,
      monthlyFeeCents: 12000,
    });
    const u2 = await cadastreService.createUnit(ctx, {
      number: '302',
      floor: 3,
      unitTypeId: suite.id,
      monthlyFeeCents: 12000,
    });
    unit1Id = u1.id;
    unit2Id = u2.id;

    const p1 = await cadastreService.createPerson(ctx, {
      fullName: 'Residente Uno',
      nationalId: '1710001001',
      waPhone: '0981111111',
    });
    const p2 = await cadastreService.createPerson(ctx, {
      fullName: 'Residente Dos',
      nationalId: '1710001002',
      waPhone: '0982222222',
    });
    owner1Id = p1.id;
    owner2Id = p2.id;

    await cadastreService.createOccupancy(ctx, {
      personId: owner1Id,
      unitId: unit1Id,
      role: 'OWNER_RESIDENT',
      validFrom: '2026-01-01T00:00:00Z',
    });
    await cadastreService.createOccupancy(ctx, {
      personId: owner2Id,
      unitId: unit2Id,
      role: 'OWNER_RESIDENT',
      validFrom: '2026-01-01T00:00:00Z',
    });
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('simulates, creates with idempotency, enforces advisory lock concurrency, and expires unpaid holds', async () => {
    const now = new Date('2026-11-23T10:00:00-05:00');

    // 1. Gym reservation (Suite, 5 people -> 1 extra USD 5,00, CONFIRMED) + Idempotency-Key
    const gymInput = {
      unitId: unit1Id,
      personId: owner1Id,
      amenityIds: [gymId],
      startsAt: '2026-11-23T19:00:00-05:00',
      endsAt: '2026-11-23T21:00:00-05:00',
      declaredAttendees: 5,
      idempotencyKey: `idem-gym-${suffix}`,
    };
    const sim = await reservationsService.simulate(ctx, gymInput, now);
    expect(sim.ok).toBe(true);
    if (sim.ok) {
      expect(sim.totalCents).toBe(500);
      expect(sim.initialStatus).toBe('CONFIRMED');
    }

    const r1 = await reservationsService.create(ctx, gymInput, now);
    const r1Dup = await reservationsService.create(ctx, gymInput, now);
    expect(r1Dup.id).toBe(r1.id);

    // 2. Concurrent exclusive Combo BBQ + Lounge bookings: strictly 1 succeeds, 1 rejected with SLOT_TAKEN
    const [resA, resB] = await Promise.allSettled([
      reservationsService.create(
        ctx,
        {
          unitId: unit1Id,
          personId: owner1Id,
          amenityIds: [bbqId, loungeId],
          startsAt: '2026-11-28T13:00:00-05:00',
          endsAt: '2026-11-28T19:00:00-05:00',
          declaredAttendees: 20,
        },
        now,
      ),
      reservationsService.create(
        ctx,
        {
          unitId: unit2Id,
          personId: owner2Id,
          amenityIds: [loungeId],
          startsAt: '2026-11-28T15:00:00-05:00',
          endsAt: '2026-11-28T18:00:00-05:00',
          declaredAttendees: 15,
        },
        now,
      ),
    ]);

    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
    const rejected = [resA, resB].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<{ status: string; totalCents: number }>).value;
    expect(winner.status).toBe('PENDING_PAYMENT');

    // 3. Expire pending payment after deadline (240 min)
    const after5Hours = new Date(now.getTime() + 300 * 60_000);
    const expiredCount = await reservationsService.expirePendingReservations(ctx, after5Hours);
    expect(expiredCount).toBe(1);
  });
});
