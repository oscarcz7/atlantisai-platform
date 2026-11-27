import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { isUuid } from '../../../common/pipes/parse-id.pipe.js';
import type {
  CreateAdminBlockInput,
  CreateReservationInput,
  UpdateReservationInput,
} from '../reservations.service.js';

/** Any UUID version (ids are UUIDv7). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_MSG = 'Identificador inválido.';
const ISO_OPTS = { strict: true } as const;

export class ReservationAttendeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  waPhone?: string;
}

export class CreateReservationDto implements CreateReservationInput {
  @Matches(UUID_RE, { message: ID_MSG })
  unitId!: string;

  @Matches(UUID_RE, { message: ID_MSG })
  personId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Matches(UUID_RE, { each: true, message: ID_MSG })
  amenityIds!: string[];

  @IsISO8601(ISO_OPTS)
  startsAt!: string;

  @IsISO8601(ISO_OPTS)
  endsAt!: string;

  @IsInt()
  @Min(1)
  declaredAttendees!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReservationAttendeeDto)
  attendees?: ReservationAttendeeDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey?: string;

  /** Sent by the web app when simulating an edit of an existing reservation. */
  @IsOptional()
  @Matches(UUID_RE, { message: ID_MSG })
  excludeReservationId?: string;
}

export class UpdateReservationDto implements UpdateReservationInput {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Matches(UUID_RE, { each: true, message: ID_MSG })
  amenityIds!: string[];

  @IsISO8601(ISO_OPTS)
  startsAt!: string;

  @IsISO8601(ISO_OPTS)
  endsAt!: string;

  @IsInt()
  @Min(1)
  declaredAttendees!: number;
}

export class CreateAdminBlockDto implements CreateAdminBlockInput {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Matches(UUID_RE, { each: true, message: ID_MSG })
  amenityIds!: string[];

  @IsISO8601(ISO_OPTS)
  startsAt!: string;

  @IsISO8601(ISO_OPTS)
  endsAt!: string;

  // Emptiness (after trim) is enforced by the service with a domain error code.
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CancelReservationDto {
  // Emptiness (after trim) is enforced by the service (CANCELLATION_REASON_REQUIRED).
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** Validates optional ?from= / ?to= query params (ISO 8601) so the service never sees an Invalid Date. */
export function parseIsoQuery(raw: unknown, name: string): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || Number.isNaN(new Date(raw).getTime())) {
    throw new BadRequestException({
      code: 'INVALID_DATE',
      message: `El parámetro ${name} debe ser una fecha ISO 8601 válida.`,
    });
  }
  return raw;
}

/** Validates an optional id query param (e.g. ?amenityId=). */
export function parseIdQuery(raw: unknown): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (!isUuid(raw)) {
    throw new BadRequestException({ code: 'INVALID_ID', message: ID_MSG });
  }
  return raw;
}
