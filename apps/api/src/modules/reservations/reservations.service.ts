import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  DomainError,
  generateUuidV7,
  REJECTION_MESSAGES_ES,
  type TenantContext,
} from '@noah/domain';
import {
  evaluateReservation,
  getLocalDateParts,
  type EvaluationInput,
  type RuleAmenity,
  type RuleAmenityScheduleWindow,
} from '@noah/rules';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AccessService } from '../access/access.service.js';
import { assertAmenitiesInTenant } from '../../common/prisma/tenant-refs.js';
import { computeArrearsMonths, reservationLedgerRef } from '../billing/arrears.js';
import { chargeCents, syncExtraGuestCharge } from '../billing/reservation-ledger.js';

export interface CreateReservationInput {
  unitId: string;
  personId: string;
  amenityIds: string[];
  startsAt: string;
  endsAt: string;
  declaredAttendees: number;
  attendees?: Array<{ name?: string; waPhone?: string }>;
  idempotencyKey?: string;
  excludeReservationId?: string;
}

export interface UpdateReservationInput {
  amenityIds: string[];
  startsAt: string;
  endsAt: string;
  declaredAttendees: number;
}

export interface CreateAdminBlockInput {
  amenityIds: string[];
  startsAt: string;
  endsAt: string;
  reason: string;
}

/** Local day keys covered by [startsAt, endsAt) — usually one, two when crossing midnight. */
function touchedDayKeys(startsAt: string, endsAt: string, timezone: string, startKey?: string): string[] {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const keys = new Set<string>([startKey ?? getLocalDateParts(start, timezone).dayKey]);
  if (!Number.isNaN(end.getTime()) && end > start) {
    // Walk day by day (bounded: reservations are hours long; cap at 7 days defensively).
    for (let t = start.getTime() + 86_400_000, i = 0; t < end.getTime() && i < 7; t += 86_400_000, i++) {
      keys.add(getLocalDateParts(new Date(t), timezone).dayKey);
    }
    keys.add(getLocalDateParts(new Date(end.getTime() - 1), timezone).dayKey);
  }
  return Array.from(keys).sort();
}

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AccessService) private readonly accessService?: AccessService,
  ) {}

  private async buildEvaluationInput(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    input: CreateReservationInput,
    now: Date,
  ): Promise<EvaluationInput> {
    const [tenant, settings, unit, amenities, accessRules, combos, existing, ledgerEntries, depositAccount] =
      await Promise.all([
        tx.tenant.findUnique({ where: { id: ctx.tenantId } }),
        tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
        tx.unit.findFirst({
          where: { id: input.unitId, tenantId: ctx.tenantId, isActive: true },
          include: { unitType: true, occupancies: true },
        }),
        tx.amenity.findMany({
          where: { tenantId: ctx.tenantId, id: { in: input.amenityIds } },
        }),
        tx.amenityAccessRule.findMany({
          where: { tenantId: ctx.tenantId, amenityId: { in: input.amenityIds } },
        }),
        tx.cleaningCombo.findMany({ where: { tenantId: ctx.tenantId } }),
        tx.reservation.findMany({
          where: {
            tenantId: ctx.tenantId,
            ...(input.excludeReservationId ? { id: { not: input.excludeReservationId } } : {}),
            status: { in: ['PENDING_PAYMENT', 'IN_REVIEW', 'CONFIRMED', 'COMPLETED', 'ADMIN_BLOCK'] },
          },
          include: { amenities: { select: { amenityId: true } } },
        }),
        tx.ledgerEntry.findMany({
          where: { tenantId: ctx.tenantId, unitId: input.unitId },
          select: { type: true, amountCents: true, dueDate: true },
        }),
        tx.depositAccount.findUnique({
          where: { tenantId_unitId: { tenantId: ctx.tenantId, unitId: input.unitId } },
        }),
      ]);

    if (!tenant || !settings) {
      throw new DomainError(
        'TENANT_NOT_CONFIGURED',
        'El edificio no tiene parámetros configurados.',
        422,
      );
    }
    if (!unit) {
      throw new DomainError('UNIT_NOT_FOUND', 'Unidad no encontrada o inactiva.', 404);
    }
    if (amenities.length !== input.amenityIds.length) {
      throw new DomainError('AMENITY_NOT_FOUND', 'Una o más áreas solicitadas no existen.', 404);
    }

    const mappedAmenities: RuleAmenity[] = amenities.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      capacity: a.capacity,
      maxDurationMinutes: a.maxDurationMinutes,
      schedule: (a.schedule as Record<string, RuleAmenityScheduleWindow> | null) ?? null,
      frequency: (a.frequency as { period: 'DAY' | 'WEEK' | 'MONTH'; max: number } | null) ?? null,
      mode: a.mode,
      advancePolicy: a.advancePolicy,
      appliesGuestQuota: a.appliesGuestQuota,
      requiresDeposit: a.requiresDeposit,
      cleaningFeeCents: a.cleaningFeeCents,
    }));

    // R04 arrears (reservation-tagged entries are netted per reservation) and R05 deposit
    const arrearsMonths = computeArrearsMonths(ledgerEntries, now);

    return {
      now,
      timezone: tenant.timezone,
      tenant: {
        depositRequiredCents: settings.depositRequiredCents,
        arrearsToleranceMonths: settings.arrearsToleranceMonths,
        extraGuestDeclaredCents: settings.extraGuestDeclaredCents,
        generalAdvanceHours: settings.generalAdvanceHours,
        shortNoticeAdvanceMinutes: settings.shortNoticeAdvanceMinutes,
      },
      person: { id: input.personId },
      unit: {
        id: unit.id,
        unitType: { code: unit.unitType.code, includedGuests: unit.unitType.includedGuests },
        arrearsMonths,
        depositBalanceCents: depositAccount?.balanceCents ?? 0,
        suspendedUntil: null,
        occupancies: unit.occupancies.map((o) => ({
          personId: o.personId,
          unitId: o.unitId,
          role: o.role,
          validFrom: o.validFrom,
          validTo: o.validTo,
        })),
      },
      amenities: mappedAmenities,
      accessRules: accessRules.map((r) => ({
        amenityId: r.amenityId,
        occupancyRole: r.occupancyRole,
        allowed: r.allowed,
      })),
      combos: combos.map((c) => ({ id: c.id, amenityIds: c.amenityIds, feeCents: c.feeCents })),
      request: {
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        declaredAttendees: input.declaredAttendees,
      },
      existing: existing.map((e) => ({
        id: e.id,
        unitId: e.unitId ?? '',
        amenityIds: e.amenities.map((a) => a.amenityId),
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        declaredAttendees: e.declaredAttendees,
        status: e.status,
      })),
    };
  }

  async simulate(ctx: TenantContext, input: CreateReservationInput, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const evalInput = await this.buildEvaluationInput(tx, ctx, input, now);
      const result = evaluateReservation(evalInput);
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message: REJECTION_MESSAGES_ES[result.code],
          details: result.details,
        };
      }
      return result;
    });
  }

  async create(ctx: TenantContext, input: CreateReservationInput, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      // Idempotency check
      if (input.idempotencyKey) {
        const existing = await tx.reservation.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: ctx.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { amenities: true, attendees: true },
        });
        if (existing) {
          return existing;
        }
      }

      // Acquire deterministic transaction-scoped advisory locks per (tenant, amenity, local day)
      const tenant = await tx.tenant.findUnique({ where: { id: ctx.tenantId } });
      const dayKey = getLocalDateParts(
        new Date(input.startsAt),
        tenant?.timezone ?? 'America/Guayaquil',
      ).dayKey;
      const sortedAmenityIds = Array.from(new Set(input.amenityIds)).sort();
      // Lock order (deadlock-free): unit first (R08 frequency quotas are per unit and span
      // weeks/months), then every (amenity, local day) the booking touches (midnight crossing).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.tenantId}:unit:${input.unitId}`}))`;
      const dayKeys = touchedDayKeys(input.startsAt, input.endsAt, tenant?.timezone ?? 'America/Guayaquil', dayKey);
      for (const amenityId of sortedAmenityIds) {
        for (const dk of dayKeys) {
          const lockKey = `${ctx.tenantId}:${amenityId}:${dk}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        }
      }

      // Re-evaluate rules strictly INSIDE the lock
      const evalInput = await this.buildEvaluationInput(tx, ctx, input, now);
      const result = evaluateReservation(evalInput);
      if (!result.ok) {
        throw new DomainError(
          result.code,
          REJECTION_MESSAGES_ES[result.code],
          result.code === 'SLOT_TAKEN' ? 409 : 422,
          result.details,
        );
      }

      const settings = await tx.tenantSettings.findUniqueOrThrow({
        where: { tenantId: ctx.tenantId },
      });

      const reservationId = generateUuidV7(now.getTime());
      const holdExpiresAt =
        result.initialStatus === 'PENDING_PAYMENT'
          ? new Date(now.getTime() + settings.paymentProofDeadlineMinutes * 60_000)
          : null;

      const created = await tx.reservation.create({
        data: {
          id: reservationId,
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          personId: input.personId,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          declaredAttendees: input.declaredAttendees,
          status: result.initialStatus,
          channel: ctx.channel,
          totalCents: result.totalCents,
          charges: result.charges as unknown as Prisma.InputJsonValue,
          holdExpiresAt,
          idempotencyKey: input.idempotencyKey ?? null,
          amenities: {
            create: sortedAmenityIds.map((amenityId) => ({
              id: generateUuidV7(now.getTime()),
              tenantId: ctx.tenantId,
              amenityId,
            })),
          },
          attendees: input.attendees?.length
            ? {
                create: input.attendees.map((att) => ({
                  id: generateUuidV7(now.getTime()),
                  tenantId: ctx.tenantId,
                  name: att.name,
                  waPhone: att.waPhone,
                })),
              }
            : undefined,
        },
        include: { amenities: true, attendees: true },
      });

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'RESERVATION_CREATED',
          entity: 'Reservation',
          entityId: created.id,
          channel: ctx.channel,
          after: {
            status: created.status,
            totalCents: created.totalCents,
            amenityIds: sortedAmenityIds,
          },
        },
      });

      // P-12: extra guests go to the unit account as a pending charge (reservation still issued).
      await syncExtraGuestCharge(tx, {
        tenantId: ctx.tenantId,
        unitId: input.unitId,
        reservationId: created.id,
        targetCents: chargeCents(result.charges, 'EXTRA_GUEST'),
        now,
      });

      if (created.status === 'CONFIRMED' && this.accessService) {
        await this.accessService.issueCredentialForReservationInTx(tx, ctx, created.id, now);
      }

      return created;
    });
  }

  async listCalendar(
    ctx: TenantContext,
    params: { from?: string; to?: string; amenityId?: string } = {},
  ) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.reservation.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(params.from ? { endsAt: { gt: new Date(params.from) } } : {}),
          ...(params.to ? { startsAt: { lt: new Date(params.to) } } : {}),
          ...(params.amenityId
            ? { amenities: { some: { amenityId: params.amenityId } } }
            : {}),
        },
        include: {
          unit: { select: { id: true, number: true } },
          person: { select: { id: true, fullName: true, waPhone: true } },
          amenities: { include: { amenity: { select: { id: true, code: true, name: true } } } },
          credentials: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, employeeNo: true, code: true, syncStatus: true },
          },
        },
        orderBy: { startsAt: 'asc' },
      }),
    );
  }

  async createAdminBlock(ctx: TenantContext, input: CreateAdminBlockInput, now: Date = new Date()) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new DomainError('INVALID_BLOCK_RANGE', 'El fin del bloqueo debe ser posterior al inicio.', 422);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      await assertAmenitiesInTenant(tx, ctx.tenantId, input.amenityIds);
      const id = generateUuidV7(now.getTime());
      const block = await tx.reservation.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          startsAt,
          endsAt,
          declaredAttendees: 0,
          status: 'ADMIN_BLOCK',
          channel: ctx.channel,
          cancellationReason: input.reason,
          amenities: {
            create: Array.from(new Set(input.amenityIds)).map((amenityId) => ({
              id: generateUuidV7(now.getTime()),
              tenantId: ctx.tenantId,
              amenityId,
            })),
          },
        },
        include: { amenities: true },
      });

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'ADMIN_BLOCK_CREATED',
          entity: 'Reservation',
          entityId: block.id,
          channel: ctx.channel,
          after: { reason: input.reason, amenityIds: input.amenityIds },
        },
      });
      return block;
    });
  }

  async cancel(ctx: TenantContext, reservationId: string, reason: string, now: Date = new Date()) {
    if (!reason.trim()) {
      throw new DomainError('CANCELLATION_REASON_REQUIRED', 'Debes indicar un motivo de cancelación.', 422);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.reservation.findFirst({
        where: { id: reservationId, tenantId: ctx.tenantId },
      });
      if (!existing) {
        throw new DomainError('RESERVATION_NOT_FOUND', 'Reserva no encontrada.', 404);
      }
      const CANCELLABLE = ['PENDING_PAYMENT', 'IN_REVIEW', 'CONFIRMED', 'ADMIN_BLOCK'] as const;
      if (!(CANCELLABLE as readonly string[]).includes(existing.status)) {
        throw new DomainError(
          'RESERVATION_NOT_CANCELLABLE',
          'Esta reserva ya no se puede cancelar (cancelada, expirada o completada).',
          422,
        );
      }
      if (existing.status !== 'ADMIN_BLOCK' && existing.endsAt <= now) {
        throw new DomainError('RESERVATION_ALREADY_PAST', 'No se puede cancelar una reserva que ya ocurrió.', 422);
      }

      // Cancellation policy (minHoursBefore). Residents (WhatsApp/AI) must respect it;
      // ADMIN/SUPERADMIN may override it — the mandatory reason + audit flag record the exception.
      let outsidePolicy = false;
      if (existing.status !== 'ADMIN_BLOCK') {
        const settings = await tx.tenantSettings.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { cancellationPolicy: true },
        });
        const policy = settings?.cancellationPolicy as { minHoursBefore?: unknown } | null | undefined;
        const minHours = typeof policy?.minHoursBefore === 'number' ? policy.minHoursBefore : 0;
        const hoursLeft = (existing.startsAt.getTime() - now.getTime()) / 3_600_000;
        if (minHours > 0 && hoursLeft < minHours) {
          const staffOverride =
            ctx.actorType === 'STAFF' && (ctx.role === 'ADMIN' || ctx.role === 'SUPERADMIN');
          if (!staffOverride) {
            throw new DomainError(
              'CANCELLATION_TOO_LATE',
              `Las reservas solo pueden cancelarse con al menos ${minHours} horas de anticipación.`,
              422,
              { minHoursBefore: minHours },
            );
          }
          outsidePolicy = true;
        }
      }

      // Atomic transition: concurrent cancellations cannot both apply.
      const claimed = await tx.reservation.updateMany({
        where: { id: reservationId, tenantId: ctx.tenantId, status: existing.status },
        data: { status: 'CANCELLED', cancellationReason: reason.trim() },
      });
      if (claimed.count !== 1) {
        throw new DomainError('RESERVATION_NOT_CANCELLABLE', 'La reserva cambió de estado; recarga e intenta de nuevo.', 409);
      }
      const updated = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
      if (existing.unitId) {
        // Extra guests never happened: reverse the pending charge. Cleaning stays (non-refundable).
        await syncExtraGuestCharge(tx, {
          tenantId: ctx.tenantId,
          unitId: existing.unitId,
          reservationId,
          targetCents: 0,
          now,
        });
      }

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'RESERVATION_CANCELLED',
          entity: 'Reservation',
          entityId: reservationId,
          channel: ctx.channel,
          before: { status: existing.status },
          after: { status: 'CANCELLED', reason: reason.trim(), ...(outsidePolicy ? { outsidePolicy: true } : {}) },
        },
      });

      if (this.accessService) {
        await this.accessService.revokeCredentialsForReservationInTx(tx, ctx, reservationId, now);
      }

      return updated;
    });
  }

  async update(
    ctx: TenantContext,
    reservationId: string,
    input: UpdateReservationInput,
    now: Date = new Date(),
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.reservation.findFirst({
        where: { id: reservationId, tenantId: ctx.tenantId },
        include: { amenities: true },
      });
      if (!existing) {
        throw new DomainError('RESERVATION_NOT_FOUND', 'Reserva no encontrada.', 404);
      }
      if (!['CONFIRMED', 'PENDING_PAYMENT', 'IN_REVIEW'].includes(existing.status)) {
        throw new DomainError(
          'RESERVATION_NOT_EDITABLE',
          'Solo se pueden editar reservas confirmadas o pendientes de pago.',
          422,
        );
      }
      if (!existing.unitId || !existing.personId) {
        throw new DomainError(
          'ADMIN_BLOCK_NOT_EDITABLE',
          'Los bloqueos administrativos no se editan desde este formulario.',
          422,
        );
      }

      const tenant = await tx.tenant.findUnique({ where: { id: ctx.tenantId } });
      const dayKey = getLocalDateParts(
        new Date(input.startsAt),
        tenant?.timezone ?? 'America/Guayaquil',
      ).dayKey;
      const sortedAmenityIds = Array.from(new Set(input.amenityIds)).sort();
      const lockAmenityIds = Array.from(
        new Set([...existing.amenities.map((a) => a.amenityId), ...sortedAmenityIds]),
      ).sort();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.tenantId}:unit:${existing.unitId}`}))`;
      const dayKeys = Array.from(
        new Set([
          ...touchedDayKeys(input.startsAt, input.endsAt, tenant?.timezone ?? 'America/Guayaquil', dayKey),
          ...touchedDayKeys(
            existing.startsAt.toISOString(),
            existing.endsAt.toISOString(),
            tenant?.timezone ?? 'America/Guayaquil',
          ),
        ]),
      ).sort();
      for (const amenityId of lockAmenityIds) {
        for (const dk of dayKeys) {
          const lockKey = `${ctx.tenantId}:${amenityId}:${dk}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        }
      }

      const evalInput = await this.buildEvaluationInput(
        tx,
        ctx,
        {
          unitId: existing.unitId,
          personId: existing.personId,
          amenityIds: sortedAmenityIds,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          declaredAttendees: input.declaredAttendees,
          excludeReservationId: existing.id,
        },
        now,
      );
      const result = evaluateReservation(evalInput);
      if (!result.ok) {
        throw new DomainError(
          result.code,
          REJECTION_MESSAGES_ES[result.code],
          result.code === 'SLOT_TAKEN' ? 409 : 422,
          result.details,
        );
      }

      // Recompute status: adding a paid cleaning area to a CONFIRMED booking must not skip C03,
      // and removing the only cleaning charge from a pending booking confirms it.
      let nextStatus = existing.status;
      let nextHoldExpiresAt = existing.holdExpiresAt;
      if (existing.status === 'CONFIRMED' && result.initialStatus === 'PENDING_PAYMENT') {
        const paid = await tx.paymentProof.aggregate({
          where: { tenantId: ctx.tenantId, reservationId: existing.id, status: 'APPROVED' },
          _sum: { amountCents: true },
        });
        const cleaningDue = result.charges
          .filter((c) => c.type === 'CLEANING')
          .reduce((sum, c) => sum + c.amountCents, 0);
        if ((paid._sum.amountCents ?? 0) < cleaningDue) {
          const settings = await tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } });
          nextStatus = 'PENDING_PAYMENT';
          nextHoldExpiresAt = new Date(now.getTime() + (settings?.paymentProofDeadlineMinutes ?? 240) * 60_000);
        }
      } else if (existing.status === 'PENDING_PAYMENT' && result.initialStatus === 'CONFIRMED') {
        nextStatus = 'CONFIRMED';
        nextHoldExpiresAt = null;
      }

      await tx.reservationAmenity.deleteMany({
        where: { reservationId: existing.id, tenantId: ctx.tenantId },
      });

      const updated = await tx.reservation.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          holdExpiresAt: nextHoldExpiresAt,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          declaredAttendees: input.declaredAttendees,
          totalCents: result.totalCents,
          charges: result.charges as unknown as Prisma.InputJsonValue,
          amenities: {
            create: sortedAmenityIds.map((amenityId) => ({
              id: generateUuidV7(now.getTime()),
              tenantId: ctx.tenantId,
              amenityId,
            })),
          },
        },
        include: { amenities: true, attendees: true },
      });

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'RESERVATION_UPDATED',
          entity: 'Reservation',
          entityId: updated.id,
          channel: ctx.channel,
          before: {
            startsAt: existing.startsAt.toISOString(),
            endsAt: existing.endsAt.toISOString(),
            declaredAttendees: existing.declaredAttendees,
            amenityIds: existing.amenities.map((a) => a.amenityId),
            status: existing.status,
            totalCents: existing.totalCents,
          },
          after: {
            startsAt: updated.startsAt.toISOString(),
            endsAt: updated.endsAt.toISOString(),
            declaredAttendees: updated.declaredAttendees,
            amenityIds: sortedAmenityIds,
            status: updated.status,
            totalCents: updated.totalCents,
          },
        },
      });

      await syncExtraGuestCharge(tx, {
        tenantId: ctx.tenantId,
        unitId: existing.unitId,
        reservationId: existing.id,
        targetCents: chargeCents(result.charges, 'EXTRA_GUEST'),
        now,
      });

      if (this.accessService) {
        if (updated.status === 'CONFIRMED') {
          await this.accessService.syncUpdatedReservationCredentialInTx(tx, ctx, updated.id, now);
        } else if (existing.status === 'CONFIRMED') {
          // Back to PENDING_PAYMENT: the QR must stop opening doors until the cleaning is paid.
          await this.accessService.revokeCredentialsForReservationInTx(tx, ctx, updated.id, now);
        }
      }

      return updated;
    });
  }

  async expirePendingReservations(ctx: TenantContext, now: Date = new Date()): Promise<number> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const expiring = await tx.reservation.findMany({
        where: { tenantId: ctx.tenantId, status: 'PENDING_PAYMENT', holdExpiresAt: { lte: now } },
        select: { id: true, unitId: true },
      });
      if (expiring.length === 0) return 0;
      const ids = expiring.map((r) => r.id);
      const result = await tx.reservation.updateMany({
        where: {
          id: { in: ids },
          tenantId: ctx.tenantId,
          status: 'PENDING_PAYMENT',
          holdExpiresAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });
      for (const r of expiring) {
        if (r.unitId) {
          await syncExtraGuestCharge(tx, { tenantId: ctx.tenantId, unitId: r.unitId, reservationId: r.id, targetCents: 0, now });
        }
      }
      await tx.auditLog.createMany({
        data: ids.map((id) => ({
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'RESERVATION_EXPIRED',
          entity: 'Reservation',
          entityId: id,
          channel: ctx.channel,
          before: { status: 'PENDING_PAYMENT' },
          after: { status: 'EXPIRED' },
        })),
      });
      return result.count;
    });
  }

  /** Expires unpaid holds across every tenant (scheduled job). */
  async expirePendingReservationsAllTenants(now: Date = new Date()): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    let total = 0;
    for (const t of tenants) {
      total += await this.expirePendingReservations(
        { tenantId: t.id, actorType: 'SYSTEM', actorId: 'scheduler', channel: 'SYSTEM' },
        now,
      );
    }
    return total;
  }
}
