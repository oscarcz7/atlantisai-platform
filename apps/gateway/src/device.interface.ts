export interface CredentialUpsertPayload {
  employeeNo: string;
  cardNo: string;
  name?: string;
  validFrom: Date;
  validTo: Date;
  doorNo?: number;
  maxOpens?: number;
}

export interface DeviceStatus {
  online: boolean;
  firmware?: string;
  userCount?: number;
  /** Reason when offline (no secrets / personal data). */
  error?: string;
}

export interface StatusOptions {
  /** Also fetch optional counters (extra ISAPI calls). Heartbeat/PING use the cheap variant. */
  detailed?: boolean;
}

export interface AccessControlDevice {
  upsertCredential(c: CredentialUpsertPayload): Promise<void>;
  revokeCredential(employeeNo: string): Promise<void>;
  openDoor(doorNo?: number): Promise<void>;
  getStatus(opts?: StatusOptions): Promise<DeviceStatus>;
}
