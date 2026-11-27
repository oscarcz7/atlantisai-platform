import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { type OccupancyRole } from '@noah/domain';
import { type ImportRowInput } from '../cadastre.service.js';

/** Any UUID version (platform ids are UUIDv7). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OCCUPANCY_ROLES: OccupancyRole[] = [
  'OWNER_RESIDENT',
  'OWNER_LANDLORD',
  'LONG_TERM_TENANT',
  'AIRBNB_HOST',
  'AIRBNB_GUEST',
];

/** Optional, but when present must not be null (the service would crash or write invalid data on null). */
const IsOptionalNotNull = (): PropertyDecorator => ValidateIf((_o, v) => v !== undefined);

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  number!: string;

  @IsInt()
  floor!: number;

  @Matches(UUID_RE, { message: 'unitTypeId debe ser un UUID' })
  unitTypeId!: string;

  /** null = sin metraje. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  areaSqm?: number | null;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  monthlyFeeCents?: number;
}

export class UpdateUnitDto {
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  number?: string;

  @IsOptionalNotNull()
  @IsInt()
  floor?: number;

  @IsOptionalNotNull()
  @Matches(UUID_RE, { message: 'unitTypeId debe ser un UUID' })
  unitTypeId?: string;

  /** null clears the area. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  areaSqm?: number | null;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  monthlyFeeCents?: number;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePersonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  /** Min length (5) is enforced by the service (422). */
  @IsString()
  @MaxLength(30)
  nationalId!: string;

  /** Normalized/validated by `normalizeEcuadorPhone` in the service. */
  @IsString()
  @MaxLength(30)
  waPhone!: string;

  @IsOptionalNotNull()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptionalNotNull()
  @IsISO8601()
  consentAt?: string;
}

export class CreateOccupancyDto {
  @Matches(UUID_RE, { message: 'personId debe ser un UUID' })
  personId!: string;

  @Matches(UUID_RE, { message: 'unitId debe ser un UUID' })
  unitId!: string;

  @IsIn(OCCUPANCY_ROLES)
  role!: OccupancyRole;

  @IsISO8601()
  validFrom!: string;

  /** null/undefined = ocupación vigente sin fecha de fin. */
  @IsOptional()
  @IsISO8601()
  validTo?: string | null;
}

/**
 * One import row. Content errors (empty strings, unknown unit type, bad cédula/phone) are reported
 * per row by `previewImport`, so string fields only need to be strings here; structural fields the
 * service relies on without checking (floor, role, dates) are strictly validated.
 */
export class ImportRowDto implements ImportRowInput {
  @IsString()
  @MaxLength(20)
  unitNumber!: string;

  @IsInt()
  floor!: number;

  @IsString()
  @MaxLength(40)
  unitTypeCode!: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  monthlyFeeCents?: number;

  @IsString()
  @MaxLength(200)
  personFullName!: string;

  @IsString()
  @MaxLength(30)
  nationalId!: string;

  @IsString()
  @MaxLength(30)
  waPhone!: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsIn(OCCUPANCY_ROLES)
  role!: OccupancyRole;

  @IsISO8601()
  validFrom!: string;

  @IsOptional()
  @IsISO8601()
  validTo?: string;
}

export class ImportRowsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}
