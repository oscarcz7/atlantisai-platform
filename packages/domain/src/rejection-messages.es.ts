import { type RejectionCode } from './rejection-codes.js';

export const REJECTION_MESSAGES_ES: Record<RejectionCode, string> = {
  NO_ACTIVE_OCCUPANCY: 'No tienes una ocupación vigente registrada en esta unidad.',
  ROLE_NOT_ALLOWED: 'Tu perfil de ocupación no tiene permiso para reservar esta área.',
  UNIT_SUSPENDED: 'La unidad tiene una suspensión administrativa vigente.',
  ARREARS_LIMIT_EXCEEDED: 'La unidad supera los meses de mora permitidos para reservar.',
  DEPOSIT_INCOMPLETE: 'La unidad no tiene el saldo completo de garantía requerido para esta área.',
  OUTSIDE_SCHEDULE: 'El horario solicitado está fuera del horario operativo del área.',
  DURATION_EXCEEDED: 'La duración solicitada supera el tiempo máximo permitido para esta área.',
  INSUFFICIENT_ADVANCE: 'La reserva no cumple con la anticipación mínima requerida.',
  FREQUENCY_LIMIT_REACHED: 'La unidad alcanzó el límite de reservas permitido en este periodo.',
  SLOT_TAKEN: 'El horario solicitado ya está reservado.',
  CAPACITY_EXCEEDED: 'La cantidad de asistentes supera el aforo máximo disponible del área.',
  AMENITY_NOT_RESERVABLE: 'Esta área es de uso libre y no requiere reserva.',
};
