import { Inject, Injectable } from '@nestjs/common';
import { DomainError, generateUuidV7, maskNationalId, type TenantContext } from '@noah/domain';
import { calculateParkingOvertime } from '@noah/rules';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FieldEncryptionService } from '../auth/crypto/field-encryption.service.js';
import { assertReservationInTenant, assertUnitInTenant } from '../../common/prisma/tenant-refs.js';

@Injectable()
export class VisitsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FieldEncryptionService) private readonly encryption: FieldEncryptionService,
  ) {}

  async list(ctx: TenantContext, search?: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const visits = await tx.visit.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(search
            ? {
                OR: [
                  { visitorName: { contains: search, mode: 'insensitive' } },
                  { plate: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { expectedAt: 'desc' },
        take: 100,
      });
      return visits.map((v) => ({
        id: v.id,
        hostUnitId: v.hostUnitId,
        visitorName: v.visitorName,
        nationalId: v.nationalIdMask,
        plate: v.plate,
        needsParking: v.needsParking,
        parkingSpot: v.parkingSpot,
        expectedAt: v.expectedAt,
        checkInAt: v.checkInAt,
        checkOutAt: v.checkOutAt,
        overtimeCents: v.overtimeCents,
      }));
    });
  }

  async getParkingStatus(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const config = await tx.parkingConfig.findUnique({ where: { tenantId: ctx.tenantId } });
      const activeVisits = await tx.visit.findMany({
        where: {
          tenantId: ctx.tenantId,
          parkingSpot: { not: null },
          checkInAt: { not: null },
          checkOutAt: null,
        },
        orderBy: { parkingSpot: 'asc' },
      });

      const totalSpots = config?.spots ?? 0;
      const spots = Array.from({ length: totalSpots }, (_, idx) => {
        const spotNumber = idx + 1;
        const occupant = activeVisits.find((v) => v.parkingSpot === spotNumber);
        return {
          spot: spotNumber,
          occupied: Boolean(occupant),
          visitId: occupant?.id ?? null,
          visitorName: occupant?.visitorName ?? null,
          plate: occupant?.plate ?? null,
          checkInAt: occupant?.checkInAt ?? null,
        };
      });

      return {
        totalSpots,
        freeMinutes: config?.freeMinutes ?? 180,
        overtimeFeeCentsPerHour: config?.overtimeFeeCentsPerHour ?? 150,
        spots,
      };
    });
  }

  async registerVisit(
    ctx: TenantContext,
    input: {
      hostUnitId: string;
      visitorName: string;
      nationalId: string;
      plate?: string;
      needsParking: boolean;
      expectedAt: string;
    },
  ) {
    const cleanId = input.nationalId.trim();
    return this.prisma.withTenant(ctx, async (tx) => {
      await assertUnitInTenant(tx, ctx.tenantId, input.hostUnitId);
      const created = await tx.visit.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          hostUnitId: input.hostUnitId,
          visitorName: input.visitorName.trim(),
          nationalIdEnc: this.encryption.encrypt(cleanId),
          nationalIdMask: maskNationalId(cleanId),
          plate: input.plate?.trim().toUpperCase(),
          needsParking: input.needsParking,
          expectedAt: new Date(input.expectedAt),
          registeredBy: ctx.actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'VISIT_REGISTERED',
          entity: 'Visit',
          entityId: created.id,
          channel: ctx.channel,
          after: { hostUnitId: created.hostUnitId, needsParking: created.needsParking },
        },
      });
      return { ...created, nationalId: created.nationalIdMask };
    });
  }

  async checkIn(ctx: TenantContext, visitId: string, parkingSpot?: number, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const visit = await tx.visit.findFirst({ where: { id: visitId, tenantId: ctx.tenantId } });
      if (!visit) {
        throw new DomainError('VISIT_NOT_FOUND', 'Visita no encontrada.', 404);
      }
      if (visit.checkInAt) {
        // Re-check-in would reset the parking timer and dodge the overtime charge.
        throw new DomainError('VISIT_ALREADY_CHECKED_IN', 'La visita ya tiene entrada registrada.', 409);
      }

      // Serialize spot assignment per tenant: two guards cannot hand out the same spot.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'parking:' + ctx.tenantId}))`;

      let assignedSpot: number | null = null;
      if (visit.needsParking || parkingSpot !== undefined) {
        const config = await tx.parkingConfig.findUnique({ where: { tenantId: ctx.tenantId } });
        const maxSpots = config?.spots ?? 0;
        const occupied = await tx.visit.findMany({
          where: {
            tenantId: ctx.tenantId,
            parkingSpot: { not: null },
            checkInAt: { not: null },
            checkOutAt: null,
          },
          select: { parkingSpot: true },
        });
        const occupiedSet = new Set(occupied.map((o) => o.parkingSpot));

        if (parkingSpot !== undefined) {
          if (parkingSpot < 1 || parkingSpot > maxSpots || occupiedSet.has(parkingSpot)) {
            throw new DomainError('PARKING_SPOT_UNAVAILABLE', 'El puesto de parqueadero no está disponible.', 409);
          }
          assignedSpot = parkingSpot;
        } else {
          for (let s = 1; s <= maxSpots; s++) {
            if (!occupiedSet.has(s)) {
              assignedSpot = s;
              break;
            }
          }
          if (assignedSpot === null) {
            throw new DomainError('NO_PARKING_AVAILABLE', 'No hay parqueaderos de visitas disponibles.', 409);
          }
        }
      }

      const claimed = await tx.visit.updateMany({
        where: { id: visit.id, tenantId: ctx.tenantId, checkInAt: null },
        data: { checkInAt: now, parkingSpot: assignedSpot },
      });
      if (claimed.count !== 1) {
        throw new DomainError('VISIT_ALREADY_CHECKED_IN', 'La visita ya tiene entrada registrada.', 409);
      }
      return tx.visit.findUniqueOrThrow({ where: { id: visit.id } });
    });
  }

  /**
   * Registers visitor exit and calculates C04 parking overtime charge into LedgerEntry if exceeded.
   */
  async checkOut(ctx: TenantContext, visitId: string, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const visit = await tx.visit.findFirst({ where: { id: visitId, tenantId: ctx.tenantId } });
      if (!visit || !visit.checkInAt) {
        throw new DomainError('VISIT_NOT_CHECKED_IN', 'La visita no tiene entrada registrada.', 422);
      }
      // Claim the exit atomically first: a repeated check-out must not charge overtime twice.
      const claimed = await tx.visit.updateMany({
        where: { id: visit.id, tenantId: ctx.tenantId, checkOutAt: null },
        data: { checkOutAt: now },
      });
      if (claimed.count !== 1) {
        throw new DomainError('VISIT_ALREADY_CHECKED_OUT', 'La visita ya tiene salida registrada.', 409);
      }

      let overtimeCents = 0;
      if (visit.parkingSpot !== null) {
        const config = await tx.parkingConfig.findUnique({ where: { tenantId: ctx.tenantId } });
        if (config) {
          const calc = calculateParkingOvertime(visit.checkInAt, now, {
            freeMinutes: config.freeMinutes,
            overtimeFeeCentsPerHour: config.overtimeFeeCentsPerHour,
          });
          overtimeCents = calc.feeCents;
          if (overtimeCents > 0) {
            await tx.ledgerEntry.create({
              data: {
                id: generateUuidV7(now.getTime()),
                tenantId: ctx.tenantId,
                unitId: visit.hostUnitId,
                type: 'PARKING_OVERTIME',
                amountCents: overtimeCents,
                description: `Exceso parqueadero visitas (${calc.billedHours} h · puesto ${visit.parkingSpot})`,
                reference: `VISIT:${visit.id}`,
              },
            });
          }
        }
      }

      const updated = await tx.visit.update({
        where: { id: visit.id },
        data: { checkOutAt: now, overtimeCents },
      });

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'VISIT_CHECKED_OUT',
          entity: 'Visit',
          entityId: visit.id,
          channel: ctx.channel,
          after: { overtimeCents },
        },
      });

      return updated;
    });
  }

  /**
   * C02: Guard registers undeclared extra guests on an active reservation.
   */
  async registerUndeclaredGuests(
    ctx: TenantContext,
    input: { unitId: string; reservationId: string; count: number },
  ) {
    if (!Number.isInteger(input.count) || input.count <= 0) {
      throw new DomainError('INVALID_GUEST_COUNT', 'La cantidad debe ser mayor a 0.', 422);
    }
    return this.prisma.withTenant(ctx, async (tx) => {
      await assertUnitInTenant(tx, ctx.tenantId, input.unitId);
      const reservation = await assertReservationInTenant(tx, ctx.tenantId, input.reservationId);
      if (reservation.unitId !== input.unitId) {
        throw new DomainError('RESERVATION_UNIT_MISMATCH', 'La reserva no pertenece a esa unidad.', 409);
      }
      if (!['CONFIRMED', 'COMPLETED'].includes(reservation.status)) {
        throw new DomainError('RESERVATION_NOT_ACTIVE', 'La reserva no está confirmada.', 409);
      }
      const settings = await tx.tenantSettings.findUniqueOrThrow({
        where: { tenantId: ctx.tenantId },
      });
      const amountCents = input.count * settings.extraGuestUndeclaredCents;
      const entry = await tx.ledgerEntry.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          type: 'EXTRA_GUEST',
          amountCents,
          description: `${input.count} invitado(s) extra no declarado(s) en reserva`,
          reference: `RESERVATION:${input.reservationId}`,
        },
      });
      await tx.auditLog.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'UNDECLARED_GUESTS_CHARGED',
          entity: 'LedgerEntry',
          entityId: entry.id,
          channel: ctx.channel,
          after: { count: input.count, amountCents },
        },
      });
      return entry;
    });
  }
}
