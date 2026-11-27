import { calculateParkingOvertime } from '@noah/rules';

export interface ParkingLiveConfig {
  freeMinutes: number;
  overtimeFeeCentsPerHour: number;
  alertMarginMinutes: number;
}

export type ParkingAlertLevel = 'OK' | 'WARNING' | 'OVERTIME';

export interface ParkingLiveStatus {
  minutesParked: number;
  freeMinutes: number;
  remainingFreeMinutes: number;
  overtimeMinutes: number;
  billedHoursSoFar: number;
  overtimeCentsSoFar: number;
  alertLevel: ParkingAlertLevel;
  /** true when the visit is within the alert margin of the free window or already in overtime. */
  alert: boolean;
}

/**
 * Live parking status of a checked-in visit (guard console). Uses the same overtime rule as check-out
 * (`calculateParkingOvertime`) so the amount shown is what would be charged if the visitor left `now`.
 */
export function computeParkingLiveStatus(checkInAt: Date, now: Date, config: ParkingLiveConfig): ParkingLiveStatus {
  const minutesParked = Math.max(0, Math.floor((now.getTime() - checkInAt.getTime()) / 60_000));
  const calc = calculateParkingOvertime(checkInAt, now, {
    freeMinutes: config.freeMinutes,
    overtimeFeeCentsPerHour: config.overtimeFeeCentsPerHour,
  });
  const remainingFreeMinutes = Math.max(0, config.freeMinutes - minutesParked);
  const alertLevel: ParkingAlertLevel =
    calc.overtimeMinutes > 0
      ? 'OVERTIME'
      : remainingFreeMinutes <= Math.max(0, config.alertMarginMinutes)
        ? 'WARNING'
        : 'OK';
  return {
    minutesParked,
    freeMinutes: config.freeMinutes,
    remainingFreeMinutes,
    overtimeMinutes: calc.overtimeMinutes,
    billedHoursSoFar: calc.billedHours,
    overtimeCentsSoFar: calc.feeCents,
    alertLevel,
    alert: alertLevel !== 'OK',
  };
}
