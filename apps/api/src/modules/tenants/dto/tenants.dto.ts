import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { type OccupancyRole } from '@noah/domain';
import {
  OCCUPANCY_ROLES,
  UpsertAmenityDto,
  UpsertParkingDto,
  UpsertSettingsDto,
  UpsertUnitTypeDto,
} from '../../catalog/dto/catalog.dto.js';
import { type BuildingConfigImportJson } from '../tenants.service.js';

/** Any UUID version (platform ids are UUIDv7). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Optional, but when present must not be null (Prisma JSON columns reject a plain null). */
const IsOptionalNotNull = (): PropertyDecorator => ValidateIf((_o, v) => v !== undefined);

type ImportJson = BuildingConfigImportJson;

/*
 * Free-form JSON (contacts, officeHours, bankAccounts, administrator, security) is only checked at
 * the top level (object / array of objects); nested keys are stored as-is. Without @ValidateNested,
 * class-validator does not inspect nested plain objects, so whitelist/forbidNonWhitelisted does not
 * reject their inner keys.
 */

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(20)
  ruc?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptionalNotNull()
  @IsString()
  @IsTimeZone()
  timezone?: string;

  @IsOptionalNotNull()
  @IsObject()
  contacts?: Record<string, unknown>;

  @IsOptionalNotNull()
  @IsObject()
  officeHours?: Record<string, unknown>;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  bankAccounts?: Array<Record<string, unknown>>;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @Matches(UUID_RE, { each: true, message: 'adminUserIds debe contener UUIDs' })
  adminUserIds?: string[];
}

export class UpdateTenantDto {
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(20)
  ruc?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptionalNotNull()
  @IsString()
  @IsTimeZone()
  timezone?: string;

  @IsOptionalNotNull()
  @IsObject()
  contacts?: Record<string, unknown>;

  @IsOptionalNotNull()
  @IsObject()
  officeHours?: Record<string, unknown>;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  bankAccounts?: Array<Record<string, unknown>>;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @Matches(UUID_RE, { each: true, message: 'adminUserIds debe contener UUIDs' })
  adminUserIds?: string[];
}

export class CloneTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}

// ---- Building config import (seed/noah.config.json) ----

export class ImportTenantInfoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(20)
  ruc?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;

  @IsOptionalNotNull()
  @IsString()
  @IsTimeZone()
  timezone?: string;

  @IsOptional()
  @IsObject()
  administrator?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  security?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  officeHours?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  bankAccounts?: Array<Record<string, unknown>>;
}

export class ImportAmenityDto extends UpsertAmenityDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(OCCUPANCY_ROLES, { each: true })
  allowedRoles!: OccupancyRole[];
}

export class ImportCleaningComboDto {
  /** Amenity codes; min 2 distinct enforced by `buildComboKey` in the service. */
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  amenities!: string[];

  @IsInt()
  @Min(1)
  feeCents!: number;
}

/**
 * Property types come from `BuildingConfigImportJson` (so the service signature is unchanged);
 * runtime validation uses the nested DTO classes via @Type.
 */
export class ImportBuildingConfigDto implements BuildingConfigImportJson {
  /** Free-text comment allowed in config files (seed/noah.config.json). Ignored by the service. */
  @IsOptional()
  @IsString()
  _comment?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ImportTenantInfoDto)
  tenant!: ImportJson['tenant'];

  @IsObject()
  @ValidateNested()
  @Type(() => UpsertSettingsDto)
  settings!: ImportJson['settings'];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpsertUnitTypeDto)
  unitTypes!: ImportJson['unitTypes'];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportAmenityDto)
  amenities!: ImportJson['amenities'];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportCleaningComboDto)
  cleaningCombos!: ImportJson['cleaningCombos'];

  @IsObject()
  @ValidateNested()
  @Type(() => UpsertParkingDto)
  parking!: ImportJson['parking'];
}
