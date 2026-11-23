export * from './types.js';
export * from './timezone.js';
export * from './evaluate-reservation.js';

export interface ParkingOvertimeConfig {
  readonly freeMinutes: number;
  readonly overtimeFeeCentsPerHour: number;
}

/**
 * Pure helper (C04) calculating visitor parking overtime charge in USD cents.
 */
export function calculateParkingOvertime(
  checkIn: Date,
  checkOut: Date,
  config: ParkingOvertimeConfig,
): { overtimeMinutes: number; billedHours: number; feeCents: number } {
  const elapsedMinutes = Math.max(0, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 60_000));
  const overtimeMinutes = Math.max(0, elapsedMinutes - config.freeMinutes);
  const billedHours = overtimeMinutes > 0 ? Math.ceil(overtimeMinutes / 60) : 0;
  return {
    overtimeMinutes,
    billedHours,
    feeCents: billedHours * config.overtimeFeeCentsPerHour,
  };
}
