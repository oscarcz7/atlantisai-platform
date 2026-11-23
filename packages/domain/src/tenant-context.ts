export type StaffRole = 'SUPERADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'GUARD';

export type OccupancyRole =
  | 'OWNER_RESIDENT'
  | 'OWNER_LANDLORD'
  | 'LONG_TERM_TENANT'
  | 'AIRBNB_HOST'
  | 'AIRBNB_GUEST';

export type Channel = 'DASHBOARD' | 'WHATSAPP' | 'SYSTEM';

export type ActorType = 'STAFF' | 'PERSON' | 'SYSTEM' | 'AI';

export interface TenantContext {
  readonly tenantId: string;
  readonly actorType: ActorType;
  readonly actorId: string;
  readonly channel: Channel;
  readonly role?: StaffRole | OccupancyRole;
}
