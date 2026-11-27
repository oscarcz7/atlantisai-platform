import { BadRequestException } from '@nestjs/common';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Any UUID version (ids are UUIDv7). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_MSG = 'Identificador inválido.';

export class RegisterVisitDto {
  @Matches(UUID_RE, { message: ID_MSG })
  hostUnitId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  visitorName!: string;

  /** Cédula / pasaporte; encrypted at rest by the service. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  nationalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;

  @IsBoolean()
  needsParking!: boolean;

  @IsISO8601({ strict: true })
  expectedAt!: string;
}

export class CheckInVisitDto {
  /** Range against the configured number of spots is checked by the service. */
  @IsOptional()
  @IsInt()
  @Min(1)
  parkingSpot?: number;
}

export class RegisterUndeclaredGuestsDto {
  @Matches(UUID_RE, { message: ID_MSG })
  unitId!: string;

  @Matches(UUID_RE, { message: ID_MSG })
  reservationId!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

/** Validates the optional ?search= query param (rejects repeated params / absurd lengths). */
export function parseSearchQuery(raw: unknown): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 100) {
    throw new BadRequestException({
      code: 'INVALID_SEARCH',
      message: 'El parámetro search debe ser un texto de hasta 100 caracteres.',
    });
  }
  return raw;
}
