export interface TagStyle {
  label: string;
  bg: string;
  color: string;
  border?: string;
}

export const OCCUPANCY_ROLE_META: Record<string, TagStyle> = {
  OWNER_RESIDENT: {
    label: 'Propietario residente',
    bg: '#e6f5ed',
    color: '#2b6f57',
    border: '#c3e4d2',
  },
  OWNER_LANDLORD: {
    label: 'Propietario arrendador',
    bg: '#f8f0dc',
    color: '#8a6816',
    border: '#e9d8ac',
  },
  LONG_TERM_TENANT: {
    label: 'Arrendatario fijo',
    bg: '#e8f3f5',
    color: '#2f6582',
    border: '#c4dfe6',
  },
  AIRBNB_HOST: {
    label: 'Anfitrión Airbnb',
    bg: '#f3ecfa',
    color: '#6b4299',
    border: '#dcc9f0',
  },
  AIRBNB_GUEST: {
    label: 'Huésped Airbnb',
    bg: '#fae9e6',
    color: '#a84740',
    border: '#efc8c2',
  },
};

export const AMENITY_MODE_META: Record<string, TagStyle> = {
  SHARED: {
    label: 'Compartida',
    bg: '#e8f3f5',
    color: '#2f6582',
    border: '#c4dfe6',
  },
  EXCLUSIVE: {
    label: 'Exclusiva',
    bg: '#f8f0dc',
    color: '#8a6816',
    border: '#e9d8ac',
  },
  FREE_USE: {
    label: 'Uso libre',
    bg: '#e6f5ed',
    color: '#2b6f57',
    border: '#c3e4d2',
  },
};

export const LEDGER_TYPE_META: Record<string, TagStyle> = {
  MONTHLY_FEE: { label: 'Alícuota mensual', bg: '#e8f3f5', color: '#2f6582' },
  CLEANING: { label: 'Tarifa de limpieza', bg: '#f8f0dc', color: '#8a6816' },
  EXTRA_GUEST: { label: 'Invitado extra', bg: '#f3ecfa', color: '#6b4299' },
  PARKING_OVERTIME: { label: 'Exceso de parqueo', bg: '#fae9e6', color: '#a84740' },
  DAMAGE: { label: 'Daño / multa', bg: '#fae9e6', color: '#a84740' },
  PAYMENT: { label: 'Pago recibido', bg: '#e6f5ed', color: '#2b6f57' },
  ADJUSTMENT: { label: 'Ajuste contable', bg: '#f1eee9', color: '#5c554c' },
};

export const GATEWAY_COMMAND_META: Record<string, TagStyle> = {
  UPSERT_CREDENTIAL: { label: 'Alta de QR', bg: '#e6f5ed', color: '#2b6f57' },
  REVOKE_CREDENTIAL: { label: 'Revocar QR', bg: '#fae9e6', color: '#a84740' },
  OPEN_DOOR: { label: 'Apertura remota', bg: '#e8f3f5', color: '#2f6582' },
  PING: { label: 'Verificación', bg: '#f1eee9', color: '#5c554c' },
  PURGE: { label: 'Limpieza de lector', bg: '#f8f0dc', color: '#8a6816' },
};

export const READER_STATUS_LABELS: Record<string, string> = {
  ONLINE: 'En línea',
  OFFLINE: 'Sin conexión',
  UNKNOWN: 'Sin verificar',
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  UNIT_CREATED: 'Unidad creada',
  UNIT_UPDATED: 'Unidad actualizada',
  UNIT_DEACTIVATED: 'Unidad desactivada',
  UNIT_DELETED: 'Unidad eliminada',
  PERSON_CREATED: 'Persona registrada',
  PERSON_DEACTIVATED: 'Persona desactivada',
  PERSON_DELETED: 'Persona eliminada',
  OCCUPANCY_CREATED: 'Ocupación vinculada',
  OCCUPANCY_DELETED: 'Ocupación eliminada',
  CADASTRE_IMPORTED: 'Catastro importado',
  SETTINGS_UPDATED: 'Parámetros actualizados',
  UNIT_TYPE_SAVED: 'Tipología guardada',
  UNIT_TYPE_DELETED: 'Tipología eliminada',
  AMENITY_SAVED: 'Área comunal guardada',
  AMENITY_DELETED: 'Área comunal eliminada',
  ACCESS_RULE_UPDATED: 'Regla de acceso actualizada',
  CLEANING_COMBO_CREATED: 'Combo de limpieza creado',
  CLEANING_COMBO_DELETED: 'Combo de limpieza eliminado',
  PARKING_CONFIG_UPDATED: 'Parqueaderos actualizados',
  LEDGER_ENTRY_CREATED: 'Movimiento registrado',
  MONTHLY_FEES_GENERATED: 'Alícuotas generadas',
  DEPOSIT_MOVEMENT_CREATED: 'Movimiento de garantía',
  PAYMENT_PROOF_SUBMITTED: 'Comprobante cargado',
  PAYMENT_PROOF_APPROVED: 'Pago aprobado',
  PAYMENT_PROOF_REJECTED: 'Comprobante rechazado',
  RESERVATION_CREATED: 'Reserva creada',
  RESERVATION_CANCELLED: 'Reserva cancelada',
  ADMIN_BLOCK_CREATED: 'Bloqueo administrativo',
  CREDENTIAL_ISSUED: 'Credencial QR emitida',
  CREDENTIAL_REVOKED: 'Credencial QR revocada',
  READER_SAVED: 'Lector guardado',
  READER_DELETED: 'Lector eliminado',
  READER_REMOTE_OPEN: 'Apertura remota de puerta',
  VISIT_REGISTERED: 'Visita registrada',
  VISIT_CHECKED_OUT: 'Salida de visita',
  UNDECLARED_GUESTS_CHARGED: 'Cargo por invitados no declarados',
  TICKET_CREATED: 'Incidencia creada',
  TICKET_STATUS_UPDATED: 'Estado de incidencia actualizado',
  TICKET_DELETED: 'Incidencia eliminada',
  CONFIG_IMPORTED: 'Configuración importada',
  TENANT_CLONED: 'Edificio clonado',
};

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  Unit: 'Unidad',
  Person: 'Persona',
  Occupancy: 'Ocupación',
  Cadastre: 'Catastro',
  Tenant: 'Edificio',
  TenantSettings: 'Parámetros',
  UnitType: 'Tipología',
  Amenity: 'Área comunal',
  AmenityAccessRule: 'Matriz de acceso',
  CleaningCombo: 'Combo de limpieza',
  ParkingConfig: 'Parqueaderos',
  LedgerEntry: 'Estado de cuenta',
  DepositMovement: 'Garantía',
  PaymentProof: 'Comprobante de pago',
  Billing: 'Facturación',
  Reservation: 'Reserva',
  Credential: 'Credencial QR',
  Reader: 'Lector QR',
  Visit: 'Visita',
  Ticket: 'Incidencia',
};

const AUDIT_CHANNEL_META: Record<string, TagStyle> = {
  DASHBOARD: { label: 'Panel web', bg: '#e8f3f5', color: '#2f6582' },
  WHATSAPP: { label: 'WhatsApp', bg: '#e6f5ed', color: '#2b6f57' },
  SYSTEM: { label: 'Sistema', bg: '#f1eee9', color: '#5c554c' },
  GATEWAY: { label: 'Lector QR', bg: '#f3ecfa', color: '#6b4299' },
};

const DAY_RANGE_LABELS: Record<string, string> = {
  'MON-FRI': 'Lun–Vie',
  'MON-SAT': 'Lun–Sáb',
  'MON-SUN': 'Lun–Dom',
  'SAT-SUN': 'Sáb–Dom',
  DAILY: 'Todos los días',
};

export function formatCodeFallback(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part, idx) => (idx === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export function getOccupancyRoleMeta(role: string): TagStyle {
  return (
    OCCUPANCY_ROLE_META[role] ?? {
      label: formatCodeFallback(role),
      bg: '#f1eee9',
      color: '#5c554c',
      border: '#dfd9cf',
    }
  );
}

export function getAmenityModeMeta(mode: string): TagStyle {
  return (
    AMENITY_MODE_META[mode] ?? {
      label: formatCodeFallback(mode),
      bg: '#f1eee9',
      color: '#5c554c',
    }
  );
}

export function getLedgerTypeMeta(type: string): TagStyle {
  return (
    LEDGER_TYPE_META[type] ?? {
      label: formatCodeFallback(type),
      bg: '#f1eee9',
      color: '#5c554c',
    }
  );
}

export function getGatewayCommandMeta(type: string): TagStyle {
  return (
    GATEWAY_COMMAND_META[type] ?? {
      label: formatCodeFallback(type),
      bg: '#f1eee9',
      color: '#5c554c',
    }
  );
}

export function getAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? formatCodeFallback(action);
}

export function getAuditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? entity;
}

export function getAuditChannelMeta(channel: string): TagStyle {
  return (
    AUDIT_CHANNEL_META[channel] ?? {
      label: formatCodeFallback(channel),
      bg: '#f1eee9',
      color: '#5c554c',
    }
  );
}

export function formatDayRange(days?: string | null): string {
  if (!days) return '—';
  return DAY_RANGE_LABELS[days.trim().toUpperCase()] ?? days;
}
