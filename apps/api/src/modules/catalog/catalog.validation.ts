import { DomainError } from '@noah/domain';

export interface TimeWindow {
  open: string;
  close: string;
}

export type AmenitySchedule = Record<string, TimeWindow> | null;

export interface AmenityFrequency {
  period: 'DAY' | 'WEEK' | 'MONTH';
  max: number;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function validateSchedule(schedule: AmenitySchedule | undefined): void {
  if (schedule === null || schedule === undefined) {
    return;
  }
  for (const [day, window] of Object.entries(schedule)) {
    if (!TIME_RE.test(window.open) || !TIME_RE.test(window.close)) {
      throw new DomainError(
        'INVALID_SCHEDULE',
        `Horario inválido para ${day}: usa formato HH:MM.`,
        422,
      );
    }
    if (parseMinutes(window.close) <= parseMinutes(window.open)) {
      throw new DomainError(
        'INVALID_SCHEDULE',
        `El horario de cierre (${window.close}) debe ser posterior al de apertura (${window.open}).`,
        422,
      );
    }
  }
}

export function validateFrequency(frequency: AmenityFrequency | null | undefined): void {
  if (frequency === null || frequency === undefined) {
    return;
  }
  if (!['DAY', 'WEEK', 'MONTH'].includes(frequency.period)) {
    throw new DomainError('INVALID_FREQUENCY', 'Periodo de frecuencia inválido.', 422);
  }
  if (!Number.isInteger(frequency.max) || frequency.max <= 0) {
    throw new DomainError(
      'INVALID_FREQUENCY',
      'El máximo de reservas por periodo debe ser mayor a 0.',
      422,
    );
  }
}

export function validateAmenityInput(input: {
  capacity: number;
  maxDurationMinutes: number;
  cleaningFeeCents?: number;
  schedule?: AmenitySchedule;
  frequency?: AmenityFrequency | null;
}): void {
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    throw new DomainError('INVALID_CAPACITY', 'El aforo debe ser mayor a 0.', 422);
  }
  if (!Number.isInteger(input.maxDurationMinutes) || input.maxDurationMinutes <= 0) {
    throw new DomainError('INVALID_DURATION', 'La duración máxima debe ser mayor a 0.', 422);
  }
  if (input.cleaningFeeCents !== undefined && input.cleaningFeeCents < 0) {
    throw new DomainError('INVALID_CLEANING_FEE', 'La tarifa de limpieza no puede ser negativa.', 422);
  }
  validateSchedule(input.schedule);
  validateFrequency(input.frequency);
}

export function buildComboKey(amenityIds: string[]): string {
  const unique = Array.from(new Set(amenityIds)).sort();
  if (unique.length < 2) {
    throw new DomainError(
      'INVALID_COMBO',
      'Un combo de limpieza debe incluir al menos 2 áreas distintas.',
      422,
    );
  }
  return unique.join('+');
}
