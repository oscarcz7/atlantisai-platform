export type StatusTone = 'success' | 'warning' | 'danger' | 'info';

export interface StatusMeta {
  readonly label: string;
  readonly tone: StatusTone;
}

export const STATUS_MAP: Record<string, StatusMeta> = {
  OK: { label: 'Operativo', tone: 'success' },
  ACTIVE: { label: 'Activa', tone: 'success' },
  INACTIVE: { label: 'Inactiva', tone: 'danger' },
  ACTIVE_USER: { label: 'Activo', tone: 'success' },
  INACTIVE_USER: { label: 'Inactivo', tone: 'danger' },
  ENABLED: { label: 'Activo', tone: 'success' },
  PENDING: { label: 'Pendiente', tone: 'warning' },
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  APPROVED: { label: 'Aprobado', tone: 'success' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
  PENDING_PAYMENT: { label: 'Pendiente de pago', tone: 'warning' },
  IN_REVIEW: { label: 'En revisión', tone: 'info' },
  CANCELLED: { label: 'Cancelada', tone: 'danger' },
  EXPIRED: { label: 'Vencida', tone: 'danger' },
  COMPLETED: { label: 'Completada', tone: 'info' },
  ADMIN_BLOCK: { label: 'Bloqueo admin', tone: 'info' },
  OPEN: { label: 'Abierta', tone: 'warning' },
  IN_PROGRESS: { label: 'En proceso', tone: 'info' },
  RESOLVED: { label: 'Resuelta', tone: 'success' },
  CLOSED: { label: 'Cerrada', tone: 'info' },
  ONLINE: { label: 'En línea', tone: 'success' },
  OFFLINE: { label: 'Sin conexión', tone: 'danger' },
  UNKNOWN: { label: 'Sin verificar', tone: 'info' },
  PROCESSING: { label: 'Procesando', tone: 'info' },
  ACKED: { label: 'Confirmado', tone: 'success' },
  FAILED: { label: 'Fallido', tone: 'danger' },
  AVAILABLE: { label: 'Disponible', tone: 'success' },
  OCCUPIED: { label: 'Ocupado', tone: 'warning' },
  ERROR: { label: 'Error', tone: 'danger' },
};
