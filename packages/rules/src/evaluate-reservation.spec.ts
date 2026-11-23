import { describe, expect, it } from 'vitest';
import { REJECTION_CODES } from '@noah/domain';
import { calculateParkingOvertime, evaluateReservation, type EvaluationInput } from './index.js';

const TZ = 'America/Guayaquil';

const SETTINGS = {
  depositRequiredCents: 20000,
  arrearsToleranceMonths: 2,
  extraGuestDeclaredCents: 500,
  generalAdvanceHours: 24,
  shortNoticeAdvanceMinutes: 60,
};

const AMENITIES = {
  GYM: {
    id: 'am-gym',
    code: 'GYM',
    name: 'Gimnasio',
    capacity: 20,
    maxDurationMinutes: 120,
    schedule: { all: { open: '05:00', close: '23:00' } },
    frequency: { period: 'DAY' as const, max: 1 },
    mode: 'SHARED' as const,
    advancePolicy: 'SHORT_NOTICE_ALLOWED' as const,
    appliesGuestQuota: true,
    requiresDeposit: false,
    cleaningFeeCents: 0,
  },
  COWORKING: {
    id: 'am-cowork',
    code: 'COWORKING',
    name: 'Zona Coworking',
    capacity: 20,
    maxDurationMinutes: 240,
    schedule: { all: { open: '07:00', close: '23:00' } },
    frequency: { period: 'DAY' as const, max: 1 },
    mode: 'SHARED' as const,
    advancePolicy: 'SHORT_NOTICE_ALLOWED' as const,
    appliesGuestQuota: true,
    requiresDeposit: false,
    cleaningFeeCents: 0,
  },
  PLAYROOM: {
    id: 'am-playroom',
    code: 'PLAYROOM',
    name: 'Área Lúdica',
    capacity: 12,
    maxDurationMinutes: 120,
    schedule: { all: { open: '08:00', close: '22:00' } },
    frequency: null,
    mode: 'FREE_USE' as const,
    advancePolicy: 'SHORT_NOTICE_ALLOWED' as const,
    appliesGuestQuota: false,
    requiresDeposit: false,
    cleaningFeeCents: 0,
  },
  LOUNGE: {
    id: 'am-lounge',
    code: 'LOUNGE',
    name: 'Área Lounge',
    capacity: 25,
    maxDurationMinutes: 360,
    schedule: { all: { open: '08:00', close: '22:00' } },
    frequency: { period: 'MONTH' as const, max: 1 },
    mode: 'EXCLUSIVE' as const,
    advancePolicy: 'GENERAL' as const,
    appliesGuestQuota: false,
    requiresDeposit: true,
    cleaningFeeCents: 3000,
  },
  HALL: {
    id: 'am-hall',
    code: 'COMMUNITY_HALL',
    name: 'Salón Comunal',
    capacity: 50,
    maxDurationMinutes: 360,
    schedule: { all: { open: '08:00', close: '22:00' } },
    frequency: { period: 'MONTH' as const, max: 1 },
    mode: 'EXCLUSIVE' as const,
    advancePolicy: 'GENERAL' as const,
    appliesGuestQuota: false,
    requiresDeposit: true,
    cleaningFeeCents: 3500,
  },
  BBQ: {
    id: 'am-bbq',
    code: 'BBQ',
    name: 'Zona BBQ',
    capacity: 40,
    maxDurationMinutes: 360,
    schedule: { all: { open: '08:00', close: '22:00' } },
    frequency: { period: 'MONTH' as const, max: 1 },
    mode: 'EXCLUSIVE' as const,
    advancePolicy: 'GENERAL' as const,
    appliesGuestQuota: false,
    requiresDeposit: true,
    cleaningFeeCents: 3500,
  },
};

const COMBOS = [
  { id: 'c-bbq-lounge', amenityIds: ['am-bbq', 'am-lounge'], feeCents: 5000 },
  { id: 'c-lounge-hall', amenityIds: ['am-lounge', 'am-hall'], feeCents: 5000 },
  { id: 'c-bbq-hall', amenityIds: ['am-bbq', 'am-hall'], feeCents: 5500 },
  { id: 'c-all-three', amenityIds: ['am-lounge', 'am-hall', 'am-bbq'], feeCents: 9000 },
];

const ACCESS_RULES = [
  ...Object.values(AMENITIES).flatMap((a) => [
    { amenityId: a.id, occupancyRole: 'OWNER_RESIDENT' as const, allowed: true },
    { amenityId: a.id, occupancyRole: 'LONG_TERM_TENANT' as const, allowed: true },
    { amenityId: a.id, occupancyRole: 'OWNER_LANDLORD' as const, allowed: false },
  ]),
  { amenityId: AMENITIES.GYM.id, occupancyRole: 'AIRBNB_GUEST' as const, allowed: true },
  { amenityId: AMENITIES.COWORKING.id, occupancyRole: 'AIRBNB_GUEST' as const, allowed: true },
  { amenityId: AMENITIES.BBQ.id, occupancyRole: 'AIRBNB_GUEST' as const, allowed: false },
];

function baseInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    now: new Date('2026-11-23T10:00:00-05:00'),
    timezone: TZ,
    tenant: SETTINGS,
    person: { id: 'p-owner' },
    unit: {
      id: 'u-101',
      unitType: { code: 'SUITE', includedGuests: 3 },
      arrearsMonths: 0,
      depositBalanceCents: 20000,
      suspendedUntil: null,
      occupancies: [
        {
          personId: 'p-owner',
          unitId: 'u-101',
          role: 'OWNER_RESIDENT',
          validFrom: new Date('2026-01-01T00:00:00-05:00'),
        },
      ],
    },
    amenities: [AMENITIES.GYM],
    accessRules: ACCESS_RULES,
    combos: COMBOS,
    request: {
      startsAt: new Date('2026-11-23T19:00:00-05:00'),
      endsAt: new Date('2026-11-23T21:00:00-05:00'),
      declaredAttendees: 5,
    },
    existing: [],
    ...overrides,
  };
}

describe('evaluateReservation — Manual cases & R01–R10 / C01–C04', () => {
  it.each([
    {
      name: 'Suite, Gimnasio, 5 personas -> 1 extra, USD 5,00, CONFIRMED',
      input: baseInput(),
      expected: { ok: true, totalCents: 500, initialStatus: 'CONFIRMED' },
    },
    {
      name: 'Estudio, Coworking, 3 personas -> 0 extras, USD 0,00, CONFIRMED',
      input: baseInput({
        amenities: [AMENITIES.COWORKING],
        unit: { ...baseInput().unit, unitType: { code: 'STUDIO', includedGuests: 2 } },
        request: {
          startsAt: new Date('2026-11-23T14:00:00-05:00'),
          endsAt: new Date('2026-11-23T16:00:00-05:00'),
          declaredAttendees: 3,
        },
      }),
      expected: { ok: true, totalCents: 0, initialStatus: 'CONFIRMED' },
    },
    {
      name: 'Combo BBQ + Lounge -> USD 50,00, PENDING_PAYMENT',
      input: baseInput({
        amenities: [AMENITIES.BBQ, AMENITIES.LOUNGE],
        request: {
          startsAt: new Date('2026-11-28T13:00:00-05:00'),
          endsAt: new Date('2026-11-28T19:00:00-05:00'),
          declaredAttendees: 20,
        },
      }),
      expected: { ok: true, totalCents: 5000, initialStatus: 'PENDING_PAYMENT' },
    },
    {
      name: 'Combo Lounge + Salón + BBQ -> USD 90,00, PENDING_PAYMENT',
      input: baseInput({
        amenities: [AMENITIES.LOUNGE, AMENITIES.HALL, AMENITIES.BBQ],
        request: {
          startsAt: new Date('2026-11-28T13:00:00-05:00'),
          endsAt: new Date('2026-11-28T19:00:00-05:00'),
          declaredAttendees: 25,
        },
      }),
      expected: { ok: true, totalCents: 9000, initialStatus: 'PENDING_PAYMENT' },
    },
  ])('$name', ({ input, expected }) => {
    const res = evaluateReservation(input);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.totalCents).toBe(expected.totalCents);
      expect(res.initialStatus).toBe(expected.initialStatus);
    }
  });

  it.each([
    {
      name: 'R01: Sin ocupación vigente -> NO_ACTIVE_OCCUPANCY',
      input: baseInput({ person: { id: 'p-unknown' } }),
      code: REJECTION_CODES.NO_ACTIVE_OCCUPANCY,
    },
    {
      name: 'R02: Huésped Airbnb en BBQ -> ROLE_NOT_ALLOWED',
      input: baseInput({
        person: { id: 'p-guest' },
        amenities: [AMENITIES.BBQ],
        unit: {
          ...baseInput().unit,
          occupancies: [
            {
              personId: 'p-guest',
              unitId: 'u-101',
              role: 'AIRBNB_GUEST',
              validFrom: new Date('2026-11-20T00:00:00-05:00'),
              validTo: new Date('2026-11-30T00:00:00-05:00'),
            },
          ],
        },
        request: {
          startsAt: new Date('2026-11-25T13:00:00-05:00'),
          endsAt: new Date('2026-11-25T17:00:00-05:00'),
          declaredAttendees: 4,
        },
      }),
      code: REJECTION_CODES.ROLE_NOT_ALLOWED,
    },
    {
      name: 'R02: Propietario con arrendatario fijo vigente -> ROLE_NOT_ALLOWED',
      input: baseInput({
        unit: {
          ...baseInput().unit,
          occupancies: [
            ...baseInput().unit.occupancies,
            {
              personId: 'p-renter',
              unitId: 'u-101',
              role: 'LONG_TERM_TENANT',
              validFrom: new Date('2026-10-01T00:00:00-05:00'),
              validTo: new Date('2027-01-01T00:00:00-05:00'),
            },
          ],
        },
      }),
      code: REJECTION_CODES.ROLE_NOT_ALLOWED,
    },
    {
      name: 'R03: Unidad suspendida -> UNIT_SUSPENDED',
      input: baseInput({
        unit: { ...baseInput().unit, suspendedUntil: new Date('2026-12-01T00:00:00-05:00') },
      }),
      code: REJECTION_CODES.UNIT_SUSPENDED,
    },
    {
      name: 'R04: Mora supera tolerancia -> ARREARS_LIMIT_EXCEEDED',
      input: baseInput({ unit: { ...baseInput().unit, arrearsMonths: 3 } }),
      code: REJECTION_CODES.ARREARS_LIMIT_EXCEEDED,
    },
    {
      name: 'R05: Garantía incompleta en área que la requiere -> DEPOSIT_INCOMPLETE',
      input: baseInput({
        amenities: [AMENITIES.LOUNGE],
        unit: { ...baseInput().unit, depositBalanceCents: 15000 },
        request: {
          startsAt: new Date('2026-11-28T14:00:00-05:00'),
          endsAt: new Date('2026-11-28T18:00:00-05:00'),
          declaredAttendees: 10,
        },
      }),
      code: REJECTION_CODES.DEPOSIT_INCOMPLETE,
    },
    {
      name: 'R06: Fuera de horario operativo -> OUTSIDE_SCHEDULE',
      input: baseInput({
        request: {
          startsAt: new Date('2026-11-24T04:00:00-05:00'),
          endsAt: new Date('2026-11-24T05:30:00-05:00'),
          declaredAttendees: 2,
        },
      }),
      code: REJECTION_CODES.OUTSIDE_SCHEDULE,
    },
    {
      name: 'R06: Duración supera máximo -> DURATION_EXCEEDED',
      input: baseInput({
        request: {
          startsAt: new Date('2026-11-23T14:00:00-05:00'),
          endsAt: new Date('2026-11-23T17:00:00-05:00'),
          declaredAttendees: 2,
        },
      }),
      code: REJECTION_CODES.DURATION_EXCEEDED,
    },
    {
      name: 'R07: Anticipación insuficiente en Lounge (<24h) -> INSUFFICIENT_ADVANCE',
      input: baseInput({
        amenities: [AMENITIES.LOUNGE],
        request: {
          startsAt: new Date('2026-11-23T15:00:00-05:00'),
          endsAt: new Date('2026-11-23T18:00:00-05:00'),
          declaredAttendees: 10,
        },
      }),
      code: REJECTION_CODES.INSUFFICIENT_ADVANCE,
    },
    {
      name: 'R08: Segunda reserva de Lounge en el mismo mes -> FREQUENCY_LIMIT_REACHED',
      input: baseInput({
        amenities: [AMENITIES.LOUNGE],
        request: {
          startsAt: new Date('2026-11-28T14:00:00-05:00'),
          endsAt: new Date('2026-11-28T18:00:00-05:00'),
          declaredAttendees: 10,
        },
        existing: [
          {
            id: 'r-prev',
            unitId: 'u-101',
            amenityIds: ['am-lounge'],
            startsAt: new Date('2026-11-10T14:00:00-05:00'),
            endsAt: new Date('2026-11-10T18:00:00-05:00'),
            declaredAttendees: 10,
            status: 'COMPLETED',
          },
        ],
      }),
      code: REJECTION_CODES.FREQUENCY_LIMIT_REACHED,
    },
    {
      name: 'R09: Área exclusiva ya ocupada -> SLOT_TAKEN',
      input: baseInput({
        amenities: [AMENITIES.LOUNGE],
        request: {
          startsAt: new Date('2026-11-28T14:00:00-05:00'),
          endsAt: new Date('2026-11-28T18:00:00-05:00'),
          declaredAttendees: 10,
        },
        existing: [
          {
            id: 'r-other',
            unitId: 'u-999',
            amenityIds: ['am-lounge'],
            startsAt: new Date('2026-11-28T16:00:00-05:00'),
            endsAt: new Date('2026-11-28T20:00:00-05:00'),
            declaredAttendees: 12,
            status: 'CONFIRMED',
          },
        ],
      }),
      code: REJECTION_CODES.SLOT_TAKEN,
    },
    {
      name: 'R09: Gimnasio con 18 asistentes reservados + 3 nuevos -> CAPACITY_EXCEEDED',
      input: baseInput({
        request: {
          startsAt: new Date('2026-11-23T19:00:00-05:00'),
          endsAt: new Date('2026-11-23T21:00:00-05:00'),
          declaredAttendees: 3,
        },
        existing: [
          {
            id: 'r-gym-full',
            unitId: 'u-999',
            amenityIds: ['am-gym'],
            startsAt: new Date('2026-11-23T19:00:00-05:00'),
            endsAt: new Date('2026-11-23T21:00:00-05:00'),
            declaredAttendees: 18,
            status: 'CONFIRMED',
          },
        ],
      }),
      code: REJECTION_CODES.CAPACITY_EXCEEDED,
    },
    {
      name: 'R09: Área de uso libre (Área Lúdica) -> AMENITY_NOT_RESERVABLE',
      input: baseInput({
        amenities: [AMENITIES.PLAYROOM],
        request: {
          startsAt: new Date('2026-11-23T14:00:00-05:00'),
          endsAt: new Date('2026-11-23T15:00:00-05:00'),
          declaredAttendees: 4,
        },
      }),
      code: REJECTION_CODES.AMENITY_NOT_RESERVABLE,
    },
    {
      name: 'R10: Asistentes declarados superan aforo -> CAPACITY_EXCEEDED',
      input: baseInput({
        request: {
          startsAt: new Date('2026-11-23T19:00:00-05:00'),
          endsAt: new Date('2026-11-23T21:00:00-05:00'),
          declaredAttendees: 21,
        },
      }),
      code: REJECTION_CODES.CAPACITY_EXCEEDED,
    },
  ])('$name', ({ input, code }) => {
    const res = evaluateReservation(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe(code);
    }
  });

  it('C04: Parqueadero 3h01m -> 1h exceso (USD 1,50); 4h30m -> 2h exceso (USD 3,00)', () => {
    const cfg = { freeMinutes: 180, overtimeFeeCentsPerHour: 150 };
    const r1 = calculateParkingOvertime(
      new Date('2026-11-23T10:00:00-05:00'),
      new Date('2026-11-23T13:01:00-05:00'),
      cfg,
    );
    expect(r1).toEqual({ overtimeMinutes: 1, billedHours: 1, feeCents: 150 });

    const r2 = calculateParkingOvertime(
      new Date('2026-11-23T10:00:00-05:00'),
      new Date('2026-11-23T14:30:00-05:00'),
      cfg,
    );
    expect(r2).toEqual({ overtimeMinutes: 90, billedHours: 2, feeCents: 300 });
  });
});
