export type StatusTone = 'success' | 'warning' | 'danger' | 'info';

export interface StatusMeta {
  readonly label: string;
  readonly tone: StatusTone;
}

export const STATUS_MAP: Record<string, StatusMeta> = {
  OK: { label: 'Operativo', tone: 'success' },
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  APPROVED: { label: 'Aprobado', tone: 'success' },
  PENDING_PAYMENT: { label: 'Pendiente de pago', tone: 'warning' },
  IN_REVIEW: { label: 'En revisión', tone: 'info' },
  CANCELLED: { label: 'Cancelada', tone: 'danger' },
  EXPIRED: { label: 'Vencida', tone: 'danger' },
  COMPLETED: { label: 'Completada', tone: 'info' },
  ERROR: { label: 'Error', tone: 'danger' },
};
