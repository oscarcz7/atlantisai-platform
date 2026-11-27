import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FieldEncryptionService } from '../auth/crypto/field-encryption.service.js';
import { CadastreService } from '../cadastre/cadastre.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { type BuildingConfigImportJson, TenantsService } from '../tenants/tenants.service.js';
import { VisitsService } from '../visits/visits.service.js';
import { BillingService } from './billing.service.js';

describe('Phase 1 E2E Modules Integration (Specs 007–011)', () => {
  const prisma = new PrismaService();
  const encryption = new FieldEncryptionService();
  const tenantsService = new TenantsService(prisma);
  const catalogService = new CatalogService(prisma);
  const cadastreService = new CadastreService(prisma, encryption);
  const billingService = new BillingService(prisma);
  const reservationsService = new ReservationsService(prisma);
  const visitsService = new VisitsService(prisma, encryption);
  const incidentsService = new IncidentsService(prisma);
  const auditService = new AuditService(prisma);

  const suffix = generateUuidV7().slice(0, 8);
  let tenantId = '';
  let ctx: TenantContext;
  let unitId = '';
  let personId = '';
  let loungeId = '';
  let bbqId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const raw = readFileSync(resolve(process.cwd(), '../../seed/noah.config.json'), 'utf8');
    const parsed = JSON.parse(raw) as BuildingConfigImportJson;
    parsed.tenant.code = `p1-${suffix}`;
    parsed.tenant.name = `Edificio Fase 1 ${suffix}`;
    const imported = await tenantsService.importConfig(parsed, 'test-admin');
    tenantId = imported.tenantId;
    ctx = {
      tenantId,
      actorType: 'STAFF',
      actorId: 'test-accountant',
      channel: 'DASHBOARD',
      role: 'SUPERADMIN',
    };

    const [unitTypes, amenities] = await Promise.all([
      catalogService.listUnitTypes(ctx),
      catalogService.listAmenities(ctx),
    ]);
    const suite = unitTypes.find((ut) => ut.code === 'SUITE')!;
    loungeId = amenities.find((a) => a.code === 'LOUNGE')!.id;
    bbqId = amenities.find((a) => a.code === 'BBQ')!.id;

    const unit = await cadastreService.createUnit(ctx, {
      number: '701',
      floor: 7,
      unitTypeId: suite.id,
      monthlyFeeCents: 10000,
    });
    unitId = unit.id;

    const person = await cadastreService.createPerson(ctx, {
      fullName: 'Propietario Fase 1',
      nationalId: '1755556666',
      waPhone: '0987001122',
    });
    personId = person.id;

    await cadastreService.createOccupancy(ctx, {
      personId,
      unitId,
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

  it('verifies billing R04/R05 enforcement, payment proof approval + receipt, garita parking overtime, incidents 48h dedupe, and audit reports', async () => {
    const now = new Date('2026-11-23T10:00:00-05:00');

    // 1. R05: Without deposit, booking Lounge fails with DEPOSIT_INCOMPLETE
    const noDepositSim = await reservationsService.simulate(
      ctx,
      {
        unitId,
        personId,
        amenityIds: [loungeId],
        startsAt: '2026-11-28T14:00:00-05:00',
        endsAt: '2026-11-28T18:00:00-05:00',
        declaredAttendees: 10,
      },
      now,
    );
    expect(noDepositSim.ok).toBe(false);
    if (!noDepositSim.ok) expect(noDepositSim.code).toBe('DEPOSIT_INCOMPLETE');

    // 2. Deposit USD 200 -> R05 passes; generate 3 overdue monthly fees -> R04 blocks!
    await billingService.recordDepositMovement(ctx, {
      unitId,
      type: 'DEPOSIT',
      amountCents: 20000,
      reason: 'Depósito inicial',
    });
    await billingService.generateMonthlyFees(ctx, { billingMonth: '2026-08', dueDate: '2026-08-10T00:00:00Z' });
    await billingService.generateMonthlyFees(ctx, { billingMonth: '2026-09', dueDate: '2026-09-10T00:00:00Z' });
    await billingService.generateMonthlyFees(ctx, { billingMonth: '2026-10', dueDate: '2026-10-10T00:00:00Z' });

    const arrearsSim = await reservationsService.simulate(
      ctx,
      {
        unitId,
        personId,
        amenityIds: [loungeId],
        startsAt: '2026-11-28T14:00:00-05:00',
        endsAt: '2026-11-28T18:00:00-05:00',
        declaredAttendees: 10,
      },
      now,
    );
    expect(arrearsSim.ok).toBe(false);
    if (!arrearsSim.ok) expect(arrearsSim.code).toBe('ARREARS_LIMIT_EXCEEDED');

    // 3. Submit & approve payment proof for 2 months -> lifts arrears block & emits REC-000001
    const submitted = await billingService.submitPaymentProof(ctx, {
      unitId,
      fileKey: 'proofs/p1.jpg',
      bank: 'Banco Pichincha',
      amountCents: 20000,
      transferDate: '2026-11-23T09:00:00Z',
      reference: 'TRF-998877',
    });
    expect(submitted.possibleDuplicate).toBe(false);

    const dup = await billingService.submitPaymentProof(ctx, {
      unitId,
      fileKey: 'proofs/p1-dup.jpg',
      bank: 'Banco Pichincha',
      amountCents: 20000,
      transferDate: '2026-11-23T09:00:00Z',
      reference: 'TRF-998877',
    });
    expect(dup.possibleDuplicate).toBe(true);

    const approved = await billingService.approvePaymentProof(ctx, submitted.proof.id, now);
    expect(approved.receipt.receiptCode).toBe('REC-000001');

    // 4. Now create BBQ + Lounge combo (PENDING_PAYMENT) -> submit proof -> approve -> auto CONFIRMED + REC-000002
    const comboRes = await reservationsService.create(
      ctx,
      {
        unitId,
        personId,
        amenityIds: [bbqId, loungeId],
        startsAt: '2026-11-28T13:00:00-05:00',
        endsAt: '2026-11-28T19:00:00-05:00',
        declaredAttendees: 20,
      },
      now,
    );
    expect(comboRes.status).toBe('PENDING_PAYMENT');

    // 4a. Underpayment (USD 1,00) is recorded but does NOT confirm the reservation
    const underProof = await billingService.submitPaymentProof(ctx, {
      unitId,
      reservationId: comboRes.id,
      fileKey: 'proofs/under.jpg',
      bank: 'Produbanco',
      amountCents: 100,
      transferDate: '2026-11-23T10:30:00Z',
      reference: 'TRF-UNDER-1',
    });
    const underApproved = await billingService.approvePaymentProof(ctx, underProof.proof.id, now);
    expect(underApproved.receipt.receiptCode).toBe('REC-000002');
    expect(underApproved.reservationConfirmed).toBe(false);
    expect(underApproved.outstandingCents).toBeGreaterThan(0);
    const calendarUnder = await reservationsService.listCalendar(ctx);
    expect(calendarUnder.find((r) => r.id === comboRes.id)?.status).not.toBe('CONFIRMED');

    const comboProof = await billingService.submitPaymentProof(ctx, {
      unitId,
      reservationId: comboRes.id,
      fileKey: 'proofs/combo.jpg',
      bank: 'Produbanco',
      amountCents: 5000,
      transferDate: '2026-11-23T11:00:00Z',
      reference: 'TRF-COMBO-50',
    });
    const comboApproved = await billingService.approvePaymentProof(ctx, comboProof.proof.id, now);
    expect(comboApproved.receipt.receiptCode).toBe('REC-000003');
    expect(comboApproved.reservationConfirmed).toBe(true);

    const calendar = await reservationsService.listCalendar(ctx);
    const updatedRes = calendar.find((r) => r.id === comboRes.id);
    expect(updatedRes?.status).toBe('CONFIRMED');

    // 4b. Reviewed proofs are immutable: no second approval, no rejecting an approved proof
    await expect(billingService.approvePaymentProof(ctx, comboProof.proof.id, now)).rejects.toMatchObject({
      code: 'PAYMENT_PROOF_ALREADY_REVIEWED',
    });
    await expect(
      billingService.rejectPaymentProof(ctx, comboProof.proof.id, 'Error', now),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROOF_ALREADY_REVIEWED' });

    // 4d. Deposit deductions cannot exceed the balance (no silent clamp)
    await expect(
      billingService.recordDepositMovement(ctx, {
        unitId,
        type: 'DEDUCTION',
        amountCents: 999_999,
        reason: 'Exceso',
      }),
    ).rejects.toMatchObject({ code: 'DEPOSIT_INSUFFICIENT_BALANCE' });

    // 4e. Cancellation is a one-way transition
    await reservationsService.cancel(ctx, comboRes.id, 'Prueba de cancelación', now);
    await expect(reservationsService.cancel(ctx, comboRes.id, 'Otra vez', now)).rejects.toMatchObject({
      code: 'RESERVATION_NOT_CANCELLABLE',
    });

    // 5. Visits & parking overtime (4h30m -> 2h overtime -> USD 3,00 ledger charge)
    const visit = await visitsService.registerVisit(ctx, {
      hostUnitId: unitId,
      visitorName: 'Pedro Visitante',
      nationalId: '1799887766',
      plate: 'PBA-1234',
      needsParking: true,
      expectedAt: '2026-11-23T10:00:00-05:00',
    });
    const checkedIn = await visitsService.checkIn(ctx, visit.id, undefined, now);
    expect(checkedIn.parkingSpot).toBe(1);

    const checkOutTime = new Date(now.getTime() + 270 * 60_000); // 4h 30m
    const checkedOut = await visitsService.checkOut(ctx, visit.id, checkOutTime);
    expect(checkedOut.overtimeCents).toBe(300);
    // Repeated check-in/out are rejected (no timer reset, no double overtime charge)
    await expect(visitsService.checkOut(ctx, visit.id, checkOutTime)).rejects.toMatchObject({
      code: 'VISIT_ALREADY_CHECKED_OUT',
    });
    await expect(visitsService.checkIn(ctx, visit.id, undefined, checkOutTime)).rejects.toMatchObject({
      code: 'VISIT_ALREADY_CHECKED_IN',
    });

    // 6. Incidents 48h duplicate detection + subscriber
    const t1 = await incidentsService.create(
      ctx,
      { category: 'Ascensor', location: 'Torre A', description: 'Luz intermitente', urgency: 'HIGH' },
      now,
    );
    expect(t1.possibleDuplicates).toHaveLength(0);

    const t2 = await incidentsService.create(
      ctx,
      { category: 'Ascensor', location: 'Torre A', description: 'Sigue parpadeando', urgency: 'MEDIUM' },
      new Date(now.getTime() + 60 * 60_000),
    );
    expect(t2.possibleDuplicates).toHaveLength(1);
    await incidentsService.subscribe(ctx, t1.ticket.id, personId);

    // 7. Audit logs & operational summary report
    const logs = await auditService.listLogs(ctx);
    expect(logs.length).toBeGreaterThan(5);
    const report = await auditService.getOperationalReport(ctx);
    expect(report.reservationsByStatus.length).toBeGreaterThan(0);
    expect(report.ledgerByType.length).toBeGreaterThan(0);
    expect(report.ticketsByCategory.length).toBeGreaterThan(0);
  });
});
