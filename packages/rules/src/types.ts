import { type OccupancyRecord, type OccupancyRole, type RejectionCode } from '@noah/domain';

export interface RuleTenantSettings {
  readonly depositRequiredCents: number;
  readonly arrearsToleranceMonths: number;
  readonly extraGuestDeclaredCents: number;
  readonly generalAdvanceHours: number;
  readonly shortNoticeAdvanceMinutes: number;
}

export interface RuleUnitType {
  readonly code: string;
  readonly includedGuests: number;
}

export interface RuleAmenityScheduleWindow {
  readonly open: string;
  readonly close: string;
}

export interface RuleAmenity {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly capacity: number;
  readonly maxDurationMinutes: number;
  readonly schedule: Record<string, RuleAmenityScheduleWindow> | null;
  readonly frequency: { readonly period: 'DAY' | 'WEEK' | 'MONTH'; readonly max: number } | null;
  readonly mode: 'SHARED' | 'EXCLUSIVE' | 'FREE_USE';
  readonly advancePolicy: 'GENERAL' | 'SHORT_NOTICE_ALLOWED';
  readonly appliesGuestQuota: boolean;
  readonly requiresDeposit: boolean;
  readonly cleaningFeeCents: number;
}

export interface RuleAmenityAccessRule {
  readonly amenityId: string;
  readonly occupancyRole: OccupancyRole;
  readonly allowed: boolean;
}

export interface RuleCleaningCombo {
  readonly id: string;
  readonly amenityIds: string[];
  readonly feeCents: number;
}

export interface RuleExistingReservation {
  readonly id: string;
  readonly unitId: string;
  readonly amenityIds: string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly declaredAttendees: number;
  readonly status:
    | 'PENDING_PAYMENT'
    | 'IN_REVIEW'
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'COMPLETED'
    | 'ADMIN_BLOCK';
}

export interface EvaluationInput {
  readonly now: Date;
  readonly timezone: string;
  readonly tenant: RuleTenantSettings;
  readonly person: {
    readonly id: string;
  };
  readonly unit: {
    readonly id: string;
    readonly unitType: RuleUnitType;
    readonly arrearsMonths: number;
    readonly depositBalanceCents: number;
    readonly suspendedUntil?: Date | null;
    readonly occupancies: OccupancyRecord[];
  };
  readonly amenities: RuleAmenity[];
  readonly accessRules: RuleAmenityAccessRule[];
  readonly combos: RuleCleaningCombo[];
  readonly request: {
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly declaredAttendees: number;
  };
  readonly existing: RuleExistingReservation[];
}

export interface ReservationCharge {
  readonly type: 'EXTRA_GUEST' | 'CLEANING';
  readonly amountCents: number;
  readonly description: string;
  readonly quantity?: number;
  readonly comboId?: string;
}

export type EvaluationResult =
  | {
      readonly ok: true;
      readonly charges: ReservationCharge[];
      readonly totalCents: number;
      readonly initialStatus: 'CONFIRMED' | 'PENDING_PAYMENT';
      readonly effectiveRole: OccupancyRole;
    }
  | {
      readonly ok: false;
      readonly code: RejectionCode;
      readonly details: Record<string, unknown>;
    };
