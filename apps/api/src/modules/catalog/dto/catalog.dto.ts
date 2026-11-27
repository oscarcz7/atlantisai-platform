import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';
import { type OccupancyRole } from '@noah/domain';
import { type AmenityFrequency, type AmenitySchedule } from '../catalog.validation.js';
import { type UpsertAmenityInput, type UpsertSettingsInput } from '../catalog.service.js';

/** Any UUID version (platform ids are UUIDv7). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OCCUPANCY_ROLES: OccupancyRole[] = [
  'OWNER_RESIDENT',
  'OWNER_LANDLORD',
  'LONG_TERM_TENANT',
  'AIRBNB_HOST',
  'AIRBNB_GUEST',
];

const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const AMENITY_MODES = ['SHARED', 'EXCLUSIVE', 'FREE_USE'] as const;
const ADVANCE_POLICIES = ['GENERAL', 'SHORT_NOTICE_ALLOWED'] as const;
const FREQUENCY_PERIODS = ['DAY', 'WEEK', 'MONTH'] as const;
const PARKING_ROUNDINGS = ['CEIL_HOUR', 'EXACT_MINUTE'];
const CLEANING_FEE_HANDLING = ['NON_REFUNDABLE', 'REFUNDABLE', 'CREDIT'];

/** Optional, but when present must not be null (the service would crash or write invalid data on null). */
export const IsOptionalNotNull = (): PropertyDecorator => ValidateIf((_o, v) => v !== undefined);

/**
 * Shape check for amenity schedules: `{ [day]: { open: string; close: string } }`.
 * HH:MM format and open < close are enforced by `validateSchedule` (catalog.validation.ts) in the service.
 */
export function IsScheduleShape(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isScheduleShape',
      validator: {
        validate: (value: unknown) => {
          if (value === null || value === undefined) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length > 14) return false;
          return entries.every(
            ([, w]) =>
              typeof w === 'object' &&
              w !== null &&
              !Array.isArray(w) &&
              Object.keys(w).every((k) => k === 'open' || k === 'close') &&
              typeof (w as Record<string, unknown>)['open'] === 'string' &&
              typeof (w as Record<string, unknown>)['close'] === 'string',
          );
        },
        defaultMessage: () => '$property debe ser un objeto { día: { open: "HH:MM", close: "HH:MM" } }',
      },
    },
    options,
  );
}

export class CancellationPolicyDto {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  minHoursBefore?: number;

  @IsOptional()
  @IsIn(CLEANING_FEE_HANDLING)
  cleaningFeeHandling?: string;
}

export class UpsertSettingsDto implements UpsertSettingsInput {
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  monthlyFeePerSqmCents?: number;

  @IsInt()
  @Min(0)
  depositRequiredCents!: number;

  @IsInt()
  @Min(0)
  arrearsToleranceMonths!: number;

  @IsInt()
  @Min(1)
  paymentProofDeadlineMinutes!: number;

  @IsInt()
  @Min(0)
  extraGuestDeclaredCents!: number;

  @IsInt()
  @Min(0)
  extraGuestUndeclaredCents!: number;

  @IsInt()
  @Min(0)
  entryMarginMinutes!: number;

  @IsInt()
  @Min(0)
  generalAdvanceHours!: number;

  @IsInt()
  @Min(0)
  shortNoticeAdvanceMinutes!: number;

  @IsOptionalNotNull()
  @IsIn(WEEK_DAYS)
  frequencyWeekStart?: string;

  /** Day of month (1-31, clamped to the month's last day) on which monthly fees are due. */
  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(31)
  monthlyFeeDueDay?: number;

  /** null clears the policy. */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CancellationPolicyDto)
  cancellationPolicy?: Record<string, unknown> | null;
}

export class UpsertUnitTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsInt()
  @Min(0)
  includedGuests!: number;
}

export class AmenityFrequencyDto {
  @IsIn(FREQUENCY_PERIODS)
  period!: 'DAY' | 'WEEK' | 'MONTH';

  @IsInt()
  @Min(1)
  max!: number;
}

export class UpsertAmenityDto implements UpsertAmenityInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsInt()
  @Min(1)
  maxDurationMinutes!: number;

  /** null = no schedule restriction. */
  @IsOptional()
  @IsScheduleShape()
  schedule?: AmenitySchedule;

  /** null = no frequency limit. */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AmenityFrequencyDto)
  frequency?: AmenityFrequency | null;

  @IsIn(AMENITY_MODES)
  mode!: 'SHARED' | 'EXCLUSIVE' | 'FREE_USE';

  @IsIn(ADVANCE_POLICIES)
  advancePolicy!: 'GENERAL' | 'SHORT_NOTICE_ALLOWED';

  @IsBoolean()
  appliesGuestQuota!: boolean;

  @IsBoolean()
  requiresDeposit!: boolean;

  @IsInt()
  @Min(0)
  cleaningFeeCents!: number;

  @IsBoolean()
  hasReader!: boolean;
}

export class SetAccessRuleDto {
  @Matches(UUID_RE, { message: 'amenityId debe ser un UUID' })
  amenityId!: string;

  @IsIn(OCCUPANCY_ROLES)
  occupancyRole!: OccupancyRole;

  @IsBoolean()
  allowed!: boolean;
}

export class CreateCleaningComboDto {
  /** Minimum of 2 distinct areas is enforced by `buildComboKey` (422). */
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @Matches(UUID_RE, { each: true, message: 'amenityIds debe contener UUIDs' })
  amenityIds!: string[];

  @IsInt()
  @Min(1)
  feeCents!: number;
}

export class UpsertParkingDto {
  @IsInt()
  @Min(0)
  spots!: number;

  @IsInt()
  @Min(0)
  freeMinutes!: number;

  @IsInt()
  @Min(0)
  overtimeFeeCentsPerHour!: number;

  @IsOptionalNotNull()
  @IsIn(PARKING_ROUNDINGS)
  rounding?: string;

  /** Minutes before the free window ends at which the guard console raises an alert. */
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  alertMarginMinutes?: number;
}
