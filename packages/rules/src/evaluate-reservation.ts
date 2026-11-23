import { REJECTION_CODES, resolveEffectiveRole } from '@noah/domain';
import { getLocalDateParts, getLocalDayName, parseHhmmToMinutes } from './timezone.js';
import {
  type EvaluationInput,
  type EvaluationResult,
  type ReservationCharge,
} from './types.js';

const FREQUENCY_COUNTED_STATUSES = new Set([
  'CONFIRMED',
  'IN_REVIEW',
  'PENDING_PAYMENT',
  'COMPLETED',
]);

const OVERLAP_ACTIVE_STATUSES = new Set([
  'CONFIRMED',
  'IN_REVIEW',
  'PENDING_PAYMENT',
  'ADMIN_BLOCK',
]);

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Pure deterministic reservation rules engine (R01–R10, C01, C03).
 * Stops at the first rejection in rule order. Zero I/O, zero system clock calls.
 */
export function evaluateReservation(input: EvaluationInput): EvaluationResult {
  const { now, timezone, tenant, person, unit, amenities, accessRules, combos, request, existing } =
    input;

  if (amenities.length === 0) {
    return {
      ok: false,
      code: REJECTION_CODES.AMENITY_NOT_RESERVABLE,
      details: { reason: 'No amenities requested' },
    };
  }

  // R01 · Ocupación vigente
  const effectiveRole = resolveEffectiveRole(person.id, unit.occupancies, request.startsAt);
  if (!effectiveRole) {
    return {
      ok: false,
      code: REJECTION_CODES.NO_ACTIVE_OCCUPANCY,
      details: { personId: person.id, unitId: unit.id },
    };
  }

  // R02 · Rol permitido en cada área solicitada
  for (const amenity of amenities) {
    const rule = accessRules.find(
      (r) => r.amenityId === amenity.id && r.occupancyRole === effectiveRole,
    );
    if (!rule || !rule.allowed) {
      return {
        ok: false,
        code: REJECTION_CODES.ROLE_NOT_ALLOWED,
        details: { amenityId: amenity.id, amenityCode: amenity.code, role: effectiveRole },
      };
    }
  }

  // R03 · Sin suspensión administrativa
  if (unit.suspendedUntil && unit.suspendedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      code: REJECTION_CODES.UNIT_SUSPENDED,
      details: { suspendedUntil: unit.suspendedUntil.toISOString() },
    };
  }

  // R04 · Mora
  if (unit.arrearsMonths > tenant.arrearsToleranceMonths) {
    return {
      ok: false,
      code: REJECTION_CODES.ARREARS_LIMIT_EXCEEDED,
      details: {
        arrearsMonths: unit.arrearsMonths,
        toleranceMonths: tenant.arrearsToleranceMonths,
      },
    };
  }

  // R05 · Garantía
  const requiresDeposit = amenities.some((a) => a.requiresDeposit);
  if (requiresDeposit && unit.depositBalanceCents < tenant.depositRequiredCents) {
    return {
      ok: false,
      code: REJECTION_CODES.DEPOSIT_INCOMPLETE,
      details: {
        balanceCents: unit.depositBalanceCents,
        requiredCents: tenant.depositRequiredCents,
      },
    };
  }

  // R06 · Horario y duración
  const durationMinutes = (request.endsAt.getTime() - request.startsAt.getTime()) / 60_000;
  if (durationMinutes <= 0) {
    return {
      ok: false,
      code: REJECTION_CODES.OUTSIDE_SCHEDULE,
      details: { durationMinutes },
    };
  }

  const startLocal = getLocalDateParts(request.startsAt, timezone);
  const endLocal = getLocalDateParts(request.endsAt, timezone);
  const startMinutes = startLocal.hour * 60 + startLocal.minute;
  const endMinutes = endLocal.hour * 60 + endLocal.minute;
  const localDayName = getLocalDayName(startLocal);

  for (const amenity of amenities) {
    if (durationMinutes > amenity.maxDurationMinutes) {
      return {
        ok: false,
        code: REJECTION_CODES.DURATION_EXCEEDED,
        details: {
          amenityId: amenity.id,
          requestedMinutes: durationMinutes,
          maxDurationMinutes: amenity.maxDurationMinutes,
        },
      };
    }

    if (amenity.schedule !== null) {
      const window = amenity.schedule[localDayName] ?? amenity.schedule['all'];
      if (!window || startLocal.dayKey !== endLocal.dayKey) {
        return {
          ok: false,
          code: REJECTION_CODES.OUTSIDE_SCHEDULE,
          details: { amenityId: amenity.id, day: localDayName },
        };
      }
      const openMin = parseHhmmToMinutes(window.open);
      const closeMin = parseHhmmToMinutes(window.close);
      if (startMinutes < openMin || endMinutes > closeMin) {
        return {
          ok: false,
          code: REJECTION_CODES.OUTSIDE_SCHEDULE,
          details: {
            amenityId: amenity.id,
            open: window.open,
            close: window.close,
          },
        };
      }
    }
  }

  // R07 · Anticipación
  const advanceMinutes = (request.startsAt.getTime() - now.getTime()) / 60_000;
  for (const amenity of amenities) {
    const requiredMinutes =
      amenity.advancePolicy === 'SHORT_NOTICE_ALLOWED'
        ? tenant.shortNoticeAdvanceMinutes
        : tenant.generalAdvanceHours * 60;
    if (advanceMinutes < requiredMinutes) {
      return {
        ok: false,
        code: REJECTION_CODES.INSUFFICIENT_ADVANCE,
        details: {
          amenityId: amenity.id,
          advanceMinutes,
          requiredMinutes,
        },
      };
    }
  }

  // R08 · Frecuencia (día, semana lunes-domingo o mes calendario en timezone)
  for (const amenity of amenities) {
    if (!amenity.frequency) continue;
    const { period, max } = amenity.frequency;
    const count = existing.filter((res) => {
      if (res.unitId !== unit.id) return false;
      if (!FREQUENCY_COUNTED_STATUSES.has(res.status)) return false;
      if (!res.amenityIds.includes(amenity.id)) return false;
      const resLocal = getLocalDateParts(res.startsAt, timezone);
      if (period === 'DAY') return resLocal.dayKey === startLocal.dayKey;
      if (period === 'WEEK') return resLocal.weekKey === startLocal.weekKey;
      return resLocal.monthKey === startLocal.monthKey;
    }).length;

    if (count >= max) {
      return {
        ok: false,
        code: REJECTION_CODES.FREQUENCY_LIMIT_REACHED,
        details: { amenityId: amenity.id, period, max, current: count },
      };
    }
  }

  // R09 · Disponibilidad
  for (const amenity of amenities) {
    if (amenity.mode === 'FREE_USE') {
      return {
        ok: false,
        code: REJECTION_CODES.AMENITY_NOT_RESERVABLE,
        details: { amenityId: amenity.id, amenityCode: amenity.code },
      };
    }

    const overlapping = existing.filter(
      (res) =>
        OVERLAP_ACTIVE_STATUSES.has(res.status) &&
        res.amenityIds.includes(amenity.id) &&
        overlaps(request.startsAt, request.endsAt, res.startsAt, res.endsAt),
    );

    if (amenity.mode === 'EXCLUSIVE') {
      if (overlapping.length > 0) {
        return {
          ok: false,
          code: REJECTION_CODES.SLOT_TAKEN,
          details: { amenityId: amenity.id },
        };
      }
    } else if (amenity.mode === 'SHARED') {
      const hasAdminBlock = overlapping.some((r) => r.status === 'ADMIN_BLOCK');
      if (hasAdminBlock) {
        return {
          ok: false,
          code: REJECTION_CODES.SLOT_TAKEN,
          details: { amenityId: amenity.id, reason: 'ADMIN_BLOCK' },
        };
      }
      const existingAttendees = overlapping.reduce((sum, r) => sum + r.declaredAttendees, 0);
      if (existingAttendees + request.declaredAttendees > amenity.capacity) {
        return {
          ok: false,
          code: REJECTION_CODES.CAPACITY_EXCEEDED,
          details: {
            amenityId: amenity.id,
            existingAttendees,
            requestedAttendees: request.declaredAttendees,
            capacity: amenity.capacity,
          },
        };
      }
    }
  }

  // R10 · Aforo de la reserva
  for (const amenity of amenities) {
    if (request.declaredAttendees > amenity.capacity) {
      return {
        ok: false,
        code: REJECTION_CODES.CAPACITY_EXCEEDED,
        details: {
          amenityId: amenity.id,
          requestedAttendees: request.declaredAttendees,
          capacity: amenity.capacity,
        },
      };
    }
  }

  // Cobros: C01 (Invitados extra declarados) y C03 (Limpieza / Combo)
  const charges: ReservationCharge[] = [];

  const appliesGuestQuota = amenities.some((a) => a.appliesGuestQuota);
  if (appliesGuestQuota) {
    const included = 1 + unit.unitType.includedGuests;
    const extras = Math.max(0, request.declaredAttendees - included);
    if (extras > 0) {
      charges.push({
        type: 'EXTRA_GUEST',
        amountCents: extras * tenant.extraGuestDeclaredCents,
        quantity: extras,
        description: `${extras} invitado(s) extra declarado(s)`,
      });
    }
  }

  const cleaningAmenities = amenities.filter((a) => a.cleaningFeeCents > 0);
  let hasCleaningCharge = false;
  if (cleaningAmenities.length > 0) {
    hasCleaningCharge = true;
    const targetKey = cleaningAmenities
      .map((a) => a.id)
      .sort()
      .join('+');
    const matchedCombo = combos.find((c) => [...c.amenityIds].sort().join('+') === targetKey);

    if (matchedCombo) {
      charges.push({
        type: 'CLEANING',
        amountCents: matchedCombo.feeCents,
        comboId: matchedCombo.id,
        description: `Combo de limpieza (${cleaningAmenities.map((a) => a.name).join(' + ')})`,
      });
    } else {
      const individualSum = cleaningAmenities.reduce((sum, a) => sum + a.cleaningFeeCents, 0);
      charges.push({
        type: 'CLEANING',
        amountCents: individualSum,
        description: `Limpieza (${cleaningAmenities.map((a) => a.name).join(', ')})`,
      });
    }
  }

  const totalCents = charges.reduce((sum, c) => sum + c.amountCents, 0);
  return {
    ok: true,
    charges,
    totalCents,
    initialStatus: hasCleaningCharge ? 'PENDING_PAYMENT' : 'CONFIRMED',
    effectiveRole,
  };
}
