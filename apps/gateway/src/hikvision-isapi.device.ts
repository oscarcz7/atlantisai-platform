import type {
  AccessControlDevice,
  CredentialUpsertPayload,
  DeviceStatus,
} from './device.interface.js';
import { digestFetch, type DigestCredentials } from './digest-fetch.js';

export interface HikvisionDeviceConfig {
  protocol: 'http' | 'https';
  ip: string;
  port: number;
  credentials: DigestCredentials;
  timezone?: string;
  employeePrefix?: string;
}

/**
 * Formats a UTC Date into Hikvision local time string: YYYY-MM-DDTHH:mm:ss
 */
export function formatHikvisionLocalTime(date: Date, timezone = 'America/Guayaquil'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/**
 * Real Hikvision DS-K1T344EBFWX-E1 ISAPI implementation.
 * Endpoints marked TODO(isapi) should be verified against the exact firmware ISAPI guide during PoC.
 */
export class HikvisionIsapiDevice implements AccessControlDevice {
  private readonly baseUrl: string;
  private readonly timezone: string;
  private readonly prefix: string;

  constructor(private readonly config: HikvisionDeviceConfig) {
    this.baseUrl = `${config.protocol}://${config.ip}:${config.port}`;
    this.timezone = config.timezone ?? 'America/Guayaquil';
    this.prefix = (config.employeePrefix ?? 'NX').toUpperCase();
  }

  private assertPrefix(employeeNo: string): void {
    if (!employeeNo.toUpperCase().startsWith(this.prefix)) {
      throw new Error(
        `Safety guard: refusing to touch employeeNo "${employeeNo}" without prefix "${this.prefix}".`,
      );
    }
  }

  async getStatus(): Promise<DeviceStatus> {
    try {
      const infoRes = await digestFetch(
        `${this.baseUrl}/ISAPI/System/deviceInfo`,
        { method: 'GET' },
        this.config.credentials,
      );
      if (!infoRes.ok) {
        return { online: false };
      }
      const xml = await infoRes.text();
      const fwMatch = xml.match(/<firmwareVersion>([^<]+)<\/firmwareVersion>/i);

      let userCount: number | undefined;
      try {
        const countRes = await digestFetch(
          `${this.baseUrl}/ISAPI/AccessControl/UserInfo/Count?format=json`,
          { method: 'GET' },
          this.config.credentials,
        );
        if (countRes.ok) {
          const json = (await countRes.json()) as { UserInfoCount?: { userNumber?: number } };
          userCount = json.UserInfoCount?.userNumber;
        }
      } catch {
        // Optional counter
      }

      return { online: true, firmware: fwMatch?.[1], userCount };
    } catch {
      return { online: false };
    }
  }

  async upsertCredential(c: CredentialUpsertPayload): Promise<void> {
    this.assertPrefix(c.employeeNo);

    const doorNo = c.doorNo ?? 1;
    // TODO(isapi): Confirm exact UserInfo/SetUp vs UserInfo/Record idempotency and maxOpenDoorTime on target firmware.
    const userPayload = {
      UserInfo: {
        employeeNo: c.employeeNo,
        name: (c.name ?? 'Reserva NOAH').slice(0, 32),
        userType: 'normal',
        Valid: {
          enable: true,
          beginTime: formatHikvisionLocalTime(c.validFrom, this.timezone),
          endTime: formatHikvisionLocalTime(c.validTo, this.timezone),
          timeType: 'local',
        },
        doorRight: String(doorNo),
        RightPlan: [{ doorNo, planTemplateNo: '1' }],
      },
    };

    const userRes = await digestFetch(
      `${this.baseUrl}/ISAPI/AccessControl/UserInfo/SetUp?format=json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userPayload),
      },
      this.config.credentials,
    );

    if (!userRes.ok) {
      // Fallback to POST /UserInfo/Record on firmwares that do not support PUT /SetUp
      const fallbackRes = await digestFetch(
        `${this.baseUrl}/ISAPI/AccessControl/UserInfo/Record?format=json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userPayload),
        },
        this.config.credentials,
      );
      if (!fallbackRes.ok) {
        const errBody = await fallbackRes.text().catch(() => '');
        throw new Error(`Hikvision UserInfo failed (${fallbackRes.status}): ${errBody.slice(0, 300)}`);
      }
    }

    // Associate QR content as cardNo
    // TODO(isapi): Confirm whether CardInfo/SetUp or CardInfo/Record is preferred on target firmware.
    const cardPayload = {
      CardInfo: {
        employeeNo: c.employeeNo,
        cardNo: c.cardNo,
        cardType: 'normalCard',
      },
    };

    const cardRes = await digestFetch(
      `${this.baseUrl}/ISAPI/AccessControl/CardInfo/Record?format=json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardPayload),
      },
      this.config.credentials,
    );

    if (!cardRes.ok) {
      const errBody = await cardRes.text().catch(() => '');
      // Ignore already-exists error for idempotency if firmware returns 400/statusSubCode
      if (!errBody.toLowerCase().includes('already') && !errBody.toLowerCase().includes('exist')) {
        throw new Error(`Hikvision CardInfo failed (${cardRes.status}): ${errBody.slice(0, 300)}`);
      }
    }
  }

  async revokeCredential(employeeNo: string): Promise<void> {
    this.assertPrefix(employeeNo);

    const res = await digestFetch(
      `${this.baseUrl}/ISAPI/AccessControl/UserInfoDetail/Delete?format=json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          UserInfoDetail: {
            mode: 'byEmployeeNo',
            EmployeeNoList: [{ employeeNo }],
          },
        }),
      },
      this.config.credentials,
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Hikvision Delete failed (${res.status}): ${errBody.slice(0, 300)}`);
    }
  }

  async openDoor(doorNo = 1): Promise<void> {
    const res = await digestFetch(
      `${this.baseUrl}/ISAPI/AccessControl/RemoteControl/door/${doorNo}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml' },
        body: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
      },
      this.config.credentials,
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Hikvision RemoteControl failed (${res.status}): ${errBody.slice(0, 300)}`);
    }
  }
}
