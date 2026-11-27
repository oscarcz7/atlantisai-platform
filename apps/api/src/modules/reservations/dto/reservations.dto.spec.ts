import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CancelReservationDto,
  CreateAdminBlockDto,
  CreateReservationDto,
  UpdateReservationDto,
} from './reservations.dto.js';

const ID_A = '01936b2e-1234-7abc-8def-0123456789ab';
const ID_B = '01936b2e-5678-7abc-8def-0123456789ac';
const ID_C = '01936b2e-9abc-7abc-8def-0123456789ad';

async function errorsFor<T extends object>(cls: new () => T, payload: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, payload) as object);
  return errors.map((e) => e.property);
}

// Mirrors buildPayload() in apps/web/app/dashboard/reservations/page.tsx
const webCreatePayload = {
  unitId: ID_A,
  personId: ID_B,
  amenityIds: [ID_C],
  startsAt: '2026-12-05T10:00:00-05:00',
  endsAt: '2026-12-05T14:00:00-05:00',
  declaredAttendees: 12,
};

describe('CreateReservationDto', () => {
  it('accepts the payload sent by the web app', async () => {
    expect(await errorsFor(CreateReservationDto, webCreatePayload)).toEqual([]);
  });

  it('accepts the edit-simulation payload with excludeReservationId, attendees and idempotencyKey', async () => {
    expect(
      await errorsFor(CreateReservationDto, {
        ...webCreatePayload,
        excludeReservationId: ID_A,
        attendees: [{ name: 'Ana' }, { waPhone: '+593999999999' }],
        idempotencyKey: 'ui-123',
      }),
    ).toEqual([]);
  });

  it('rejects negative, zero or fractional attendees', async () => {
    for (const declaredAttendees of [-15, 0, 2.5, '12']) {
      expect(await errorsFor(CreateReservationDto, { ...webCreatePayload, declaredAttendees })).toContain(
        'declaredAttendees',
      );
    }
  });

  it('rejects duplicate, empty or malformed amenityIds', async () => {
    for (const amenityIds of [[ID_C, ID_C], [], ['not-a-uuid'], ID_C]) {
      expect(await errorsFor(CreateReservationDto, { ...webCreatePayload, amenityIds })).toContain('amenityIds');
    }
  });

  it('rejects invalid dates and missing required fields', async () => {
    expect(await errorsFor(CreateReservationDto, { ...webCreatePayload, startsAt: '2026-13-45T10:00' })).toContain(
      'startsAt',
    );
    expect(await errorsFor(CreateReservationDto, { ...webCreatePayload, endsAt: 'mañana' })).toContain('endsAt');
    const { unitId: _u, ...missingUnit } = webCreatePayload;
    expect(await errorsFor(CreateReservationDto, missingUnit)).toContain('unitId');
  });

  it('validates nested attendees', async () => {
    expect(
      await errorsFor(CreateReservationDto, { ...webCreatePayload, attendees: [{ name: 123 }] }),
    ).toContain('attendees');
  });
});

describe('UpdateReservationDto', () => {
  const webUpdatePayload = {
    amenityIds: [ID_C],
    startsAt: '2026-12-05T10:00:00-05:00',
    endsAt: '2026-12-05T14:00:00-05:00',
    declaredAttendees: 8,
  };

  it('accepts the payload sent by the web app', async () => {
    expect(await errorsFor(UpdateReservationDto, webUpdatePayload)).toEqual([]);
  });

  it('rejects negative attendees and duplicate amenities', async () => {
    expect(await errorsFor(UpdateReservationDto, { ...webUpdatePayload, declaredAttendees: -15 })).toContain(
      'declaredAttendees',
    );
    expect(await errorsFor(UpdateReservationDto, { ...webUpdatePayload, amenityIds: [ID_C, ID_C] })).toContain(
      'amenityIds',
    );
  });
});

describe('CreateAdminBlockDto', () => {
  it('accepts a valid block and rejects a missing reason / bad date', async () => {
    const ok = {
      amenityIds: [ID_C],
      startsAt: '2026-12-05T00:00:00-05:00',
      endsAt: '2026-12-06T00:00:00-05:00',
      reason: 'Mantenimiento',
    };
    expect(await errorsFor(CreateAdminBlockDto, ok)).toEqual([]);
    const { reason: _r, ...noReason } = ok;
    expect(await errorsFor(CreateAdminBlockDto, noReason)).toContain('reason');
    expect(await errorsFor(CreateAdminBlockDto, { ...ok, startsAt: 'x' })).toContain('startsAt');
  });
});

describe('CancelReservationDto', () => {
  it('requires a string reason with a reasonable length', async () => {
    expect(await errorsFor(CancelReservationDto, { reason: 'Cambio de planes' })).toEqual([]);
    expect(await errorsFor(CancelReservationDto, {})).toContain('reason');
    expect(await errorsFor(CancelReservationDto, { reason: 'x'.repeat(501) })).toContain('reason');
  });
});
