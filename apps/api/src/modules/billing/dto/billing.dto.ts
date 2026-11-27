import { BadRequestException } from '@nestjs/common';
import {
  IsIn,
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
const ISO_OPTS = { strict: true } as const;

export const DEPOSIT_MOVEMENT_TYPES = ['DEPOSIT', 'DEDUCTION', 'REFUND'] as const;
export type DepositMovementType = (typeof DEPOSIT_MOVEMENT_TYPES)[number];

export const PAYMENT_PROOF_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type PaymentProofStatus = (typeof PAYMENT_PROOF_STATUSES)[number];

export class GenerateMonthlyFeesDto {
  /** YYYY-MM (from the dashboard's month picker). */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'billingMonth debe tener formato YYYY-MM.' })
  billingMonth!: string;

  @IsISO8601(ISO_OPTS)
  dueDate!: string;
}

export class RecordDepositMovementDto {
  @Matches(UUID_RE, { message: ID_MSG })
  unitId!: string;

  @IsIn(DEPOSIT_MOVEMENT_TYPES)
  type!: DepositMovementType;

  /** Always positive: the movement type decides the sign of the balance delta. */
  @IsInt()
  @Min(1)
  amountCents!: number;

  // Emptiness (after trim) is enforced by the service (REASON_REQUIRED).
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  evidenceKey?: string;
}

export class SubmitPaymentProofDto {
  @Matches(UUID_RE, { message: ID_MSG })
  unitId!: string;

  @IsOptional()
  @Matches(UUID_RE, { message: ID_MSG })
  reservationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bank!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsISO8601(ISO_OPTS)
  transferDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference!: string;
}

export class RejectPaymentProofDto {
  // Emptiness (after trim) is enforced by the service (REJECTION_REASON_REQUIRED).
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** Validates the optional ?status= filter for payment proofs. */
export function parsePaymentProofStatus(raw: unknown): PaymentProofStatus | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || !(PAYMENT_PROOF_STATUSES as readonly string[]).includes(raw)) {
    throw new BadRequestException({
      code: 'INVALID_STATUS',
      message: `El parámetro status debe ser uno de: ${PAYMENT_PROOF_STATUSES.join(', ')}.`,
    });
  }
  return raw as PaymentProofStatus;
}
