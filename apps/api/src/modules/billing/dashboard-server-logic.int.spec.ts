import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FieldEncryptionService } from '../auth/crypto/field-encryption.service.js';
import { CadastreService } from '../cadastre/cadastre.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { type BuildingConfigImportJson, TenantsService } from '../tenants/tenants.service.js';
import { VisitsService } from '../visits/visits.service.js';
import { BillingService } from './billing.service.js';

describe('Dashboard server-side logic (fees, due dates, parking, balance)', () => {
  const prisma = new PrismaService();
  const encryption = new FieldEncryptionService();
  const tenantsService = new TenantsService(prisma);
  const catalogService = new CatalogService(prisma);
  const cadastreService = new CadastreService(prisma, encryption);
  const billingService = new BillingService(prisma);
  const visitsService = new VisitsService(prisma, encryption);

  const suffix = generateUuidV7().slice(0, 8);
  let tenantId = '';
  let ctx: TenantContext;
  let unitTypeId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const raw = readFileSync(resolve(process.cwd(), '../../seed/noah.config.json'), 'utf8');
    const parsed = JSON.parse(raw) as BuildingConfigImportJson;
    parsed.tenant.code = `dsl-${suffix}`;
    parsed.tenant.name = `Edificio lógica ${suffix}`;
    parsed.tenant.timezone = 'America/Guayaquil';
    const imported = await tenantsService.importConfig(parsed, 'test-admin');
    tenantId = imported.tenantId;
    ctx = { tenantId, actorType: 'STAFF', actorId: 'test-admin', channel: 'DASHBOARD', role: 'SUPERADMIN' };
    unitTypeId = (await catalogService.listUnitTypes(ctx))[0]!.id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('unit monthly fee: automatic vs manual is decided and recalculated by the API', async () => {
    const settings = (await catalogService.getSettings(ctx))!;
    const { id: _id, tenantId: _t, createdAt: _c, updatedAt: _u, cancellationPolicy: _p, ...rest } = settings;
    await catalogService.upsertSettings(ctx, { ...rest, monthlyFeePerSqmCents: 300, monthlyFeeDueDay: 5 });

    const auto = await cadastreService.createUnit(ctx, { number: 'A1', floor: 1, unitTypeId, areaSqm: 80 });
    expect(auto).toMatchObject({ monthlyFeeCents: 24000, monthlyFeeIsManual: false });
    const manual = await cadastreService.createUnit(ctx, {
      number: 'M1',
      floor: 1,
      unitTypeId,
      areaSqm: 80,
      monthlyFeeCents: 15000,
    });
    expect(manual).toMatchObject({ monthlyFeeCents: 15000, monthlyFeeIsManual: true });

    const listed = await cadastreService.listUnits(ctx);
    expect(listed.find((u) => u.id === manual.id)).toMatchObject({
      monthlyFeeCents: 15000,
      monthlyFeeIsManual: true,
      autoMonthlyFeeCents: 24000,
    });

    // Rate change recalculates only automatic units
    const updatedSettings = (await catalogService.getSettings(ctx))!;
    const { id: _i2, tenantId: _t2, createdAt: _c2, updatedAt: _u2, cancellationPolicy: _p2, ...rest2 } = updatedSettings;
    expect(rest2.monthlyFeeDueDay).toBe(5);
    await catalogService.upsertSettings(ctx, { ...rest2, monthlyFeePerSqmCents: 400 });
    const afterRate = await cadastreService.listUnits(ctx);
    expect(afterRate.find((u) => u.id === auto.id)?.monthlyFeeCents).toBe(32000);
    expect(afterRate.find((u) => u.id === manual.id)?.monthlyFeeCents).toBe(15000);

    // Area change keeps manual fee; choosing AUTO clears the flag
    expect(await cadastreService.updateUnit(ctx, manual.id, { areaSqm: 100 })).toMatchObject({
      monthlyFeeCents: 15000,
      monthlyFeeIsManual: true,
    });
    expect(await cadastreService.updateUnit(ctx, manual.id, { monthlyFeeMode: 'AUTO' })).toMatchObject({
      monthlyFeeCents: 40000,
      monthlyFeeIsManual: false,
    });
    await expect(cadastreService.updateUnit(ctx, manual.id, { monthlyFeeMode: 'MANUAL' })).rejects.toMatchObject({
      code: 'MONTHLY_FEE_REQUIRED',
    });
  });

  it('generates monthly fees for the building month with the configured due day (31st 20:00 Guayaquil)', async () => {
    const now = new Date('2026-10-31T20:00:00-05:00');
    const res = await billingService.generateMonthlyFees(ctx, {}, now);
    expect(res.billingMonth).toBe('2026-10');
    expect(res.dueDate).toBe('2026-10-06T04:59:59.000Z'); // day 5, 23:59:59 -05:00
    expect(res.created).toBeGreaterThanOrEqual(2);
    const again = await billingService.generateMonthlyFees(ctx, {}, now);
    expect(again.created).toBe(0);
  });

  it('monthly balance returns billed vs collected per building month', async () => {
    const now = new Date('2026-11-15T12:00:00-05:00');
    await billingService.generateMonthlyFees(ctx, { billingMonth: '2026-11' }, now);
    const units = await cadastreService.listUnits(ctx);
    await billingService.addLedgerEntry(ctx, {
      unitId: units[0]!.id,
      type: 'PAYMENT',
      amountCents: -5000,
      description: 'Pago de prueba',
    });
    const balance = await billingService.getMonthlyBalance(ctx, 6, now);
    expect(balance.months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    const totalBilled = units.reduce((s, u) => s + (u.isActive && u.monthlyFeeCents > 0 ? u.monthlyFeeCents : 0), 0);
    expect(balance.months.find((m) => m.month === '2026-11')?.billedCents).toBe(totalBilled);
    expect(balance.months.find((m) => m.month === '2026-10')?.billedCents).toBeGreaterThan(0);
  });

  it('visits list exposes live parking fields with the configured alert margin', async () => {
    const parking = (await catalogService.getParkingConfig(ctx))!;
    await catalogService.upsertParkingConfig(ctx, {
      spots: parking.spots,
      freeMinutes: 120,
      overtimeFeeCentsPerHour: 200,
      alertMarginMinutes: 30,
    });
    const units = await cadastreService.listUnits(ctx);
    const visit = await visitsService.registerVisit(ctx, {
      hostUnitId: units[0]!.id,
      visitorName: 'Visitante Parqueo',
      nationalId: '1799887766',
      needsParking: true,
      expectedAt: new Date().toISOString(),
    });
    const checkInAt = new Date(Date.now() - 100 * 60_000);
    await visitsService.checkIn(ctx, visit.id, undefined, checkInAt);

    const listed = await visitsService.list(ctx);
    const row = listed.find((v) => v.id === visit.id)!;
    expect(row.parking).toMatchObject({ freeMinutes: 120, alertLevel: 'WARNING', alert: true, overtimeCentsSoFar: 0 });
    expect(row.parking!.minutesParked).toBeGreaterThanOrEqual(100);

    const later = await visitsService.list(ctx, undefined, new Date(checkInAt.getTime() + 150 * 60_000));
    expect(later.find((v) => v.id === visit.id)?.parking).toMatchObject({
      alertLevel: 'OVERTIME',
      overtimeMinutes: 30,
      overtimeCentsSoFar: 200,
    });

    const status = await visitsService.getParkingStatus(ctx);
    expect(status).toMatchObject({ configured: true, freeMinutes: 120, alertMarginMinutes: 30 });
    expect(status.spots.find((s) => s.visitId === visit.id)?.parking?.alert).toBe(true);
  });
});
