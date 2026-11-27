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
}

export interface AccessControlDevice {
  upsertCredential(c: CredentialUpsertPayload): Promise<void>;
  revokeCredential(employeeNo: string): Promise<void>;
  openDoor(doorNo?: number): Promise<void>;
  getStatus(): Promise<DeviceStatus>;
}
