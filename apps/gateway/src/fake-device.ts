import type {
  AccessControlDevice,
  CredentialUpsertPayload,
  DeviceStatus,
} from './device.interface.js';

export class FakeDevice implements AccessControlDevice {
  private readonly credentials = new Map<string, CredentialUpsertPayload>();
  private readonly prefix: string;
  public readonly openedDoors: number[] = [];

  constructor(
    private readonly readerCode: string,
    prefix = 'NX',
  ) {
    this.prefix = prefix.toUpperCase();
  }

  private assertPrefix(employeeNo: string): void {
    if (!employeeNo.toUpperCase().startsWith(this.prefix)) {
      throw new Error(
        `Refusing to mutate employeeNo "${employeeNo}" without system prefix "${this.prefix}".`,
      );
    }
  }

  async upsertCredential(c: CredentialUpsertPayload): Promise<void> {
    this.assertPrefix(c.employeeNo);
    this.credentials.set(c.employeeNo, c);
    console.log(
      `[FakeDevice:${this.readerCode}] UPSERT employeeNo=${c.employeeNo} cardNo=${c.cardNo} valid=${c.validFrom.toISOString()}..${c.validTo.toISOString()}`,
    );
  }

  async revokeCredential(employeeNo: string): Promise<void> {
    this.assertPrefix(employeeNo);
    this.credentials.delete(employeeNo);
    console.log(`[FakeDevice:${this.readerCode}] REVOKE employeeNo=${employeeNo}`);
  }

  async openDoor(doorNo = 1): Promise<void> {
    this.openedDoors.push(doorNo);
    console.log(`[FakeDevice:${this.readerCode}] OPEN_DOOR doorNo=${doorNo}`);
  }

  async getStatus(): Promise<DeviceStatus> {
    return {
      online: true,
      firmware: 'FAKE-POC-1.0',
      userCount: this.credentials.size,
    };
  }

  listLoadedEmployeeNos(): string[] {
    return Array.from(this.credentials.keys());
  }
}
