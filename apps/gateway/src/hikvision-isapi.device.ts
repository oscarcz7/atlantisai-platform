import { isIP } from 'node:net';
import type {
  AccessControlDevice,
  CredentialUpsertPayload,
  DeviceStatus,
  StatusOptions,
} from './device.interface.js';
import { DigestClient, type DigestCredentials, type FetchLike } from './digest-fetch.js';
import { createPinnedTlsFetch, hasPinnedTls, type ReaderTlsOptions } from './reader-transport.js';

export interface HikvisionDeviceConfig {
  protocol: 'http' | 'https';
  ip: string;
  port: number;
  credentials: DigestCredentials;
  timezone?: string;
  employeePrefix?: string;
  /** Per-request timeout for ISAPI calls (default 10 s). */
  timeoutMs?: number;
  /** Pinned CA / certificate fingerprint for https readers with self-signed certs. */
  tls?: ReaderTlsOptions;
  /** Test hook / custom transport. */
  fetchImpl?: FetchLike;
}

/** Describes a network error without leaking credentials (undici puts the real cause in err.cause). */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'timeout';
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code) return `${err.message} (${cause.code})`;
  if (cause?.message) return `${err.message} (${cause.message})`;
  return err.message;
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
  private readonly client: DigestClient;

  constructor(private readonly config: HikvisionDeviceConfig) {
    const host = isIP(config.ip) === 6 ? `[${config.ip}]` : config.ip;
    this.baseUrl = `${config.protocol}://${host}:${config.port}`;
    this.timezone = config.timezone ?? 'America/Guayaquil';
    this.prefix = (config.employeePrefix ?? 'NX').toUpperCase();
    const fetchImpl =
      config.fetchImpl ??
      (config.protocol === 'https' && hasPinnedTls(config.tls)
        ? createPinnedTlsFetch(config.tls)
        : undefined);
    this.client = new DigestClient(config.credentials, {
      timeoutMs: config.timeoutMs ?? 10_000,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }

  private request(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ) {
    return this.client.request(`${this.baseUrl}${path}`, init);
  }

  private assertPrefix(employeeNo: string): void {
    if (!employeeNo.toUpperCase().startsWith(this.prefix)) {
      throw new Error(
        `Safety guard: refusing to touch employeeNo "${employeeNo}" without prefix "${this.prefix}".`,
      );
    }
  }

  async getStatus(opts: StatusOptions = {}): Promise<DeviceStatus> {
    try {
      const infoRes = await this.request('/ISAPI/System/deviceInfo', { method: 'GET' });
      if (!infoRes.ok) {
        await infoRes.body?.cancel().catch(() => undefined);
        return { online: false, error: `ISAPI deviceInfo HTTP ${infoRes.status}` };
      }
      const xml = await infoRes.text();
      const fwMatch = xml.match(/<firmwareVersion>([^<]+)<\/firmwareVersion>/i);

      let userCount: number | undefined;
      if (opts.detailed) {
        try {
          const countRes = await this.request('/ISAPI/AccessControl/UserInfo/Count?format=json', {
            method: 'GET',
          });
          if (countRes.ok) {
            const json = (await countRes.json()) as { UserInfoCount?: { userNumber?: number } };
            userCount = json.UserInfoCount?.userNumber;
          }
        } catch {
          // Optional counter
        }
      }

      return { online: true, firmware: fwMatch?.[1]?.slice(0, 128), userCount };
    } catch (err) {
      return { online: false, error: describeError(err) };
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

    const userRes = await this.request(`/ISAPI/AccessControl/UserInfo/SetUp?format=json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userPayload),
    });

    if (!userRes.ok) {
      // Fallback to POST /UserInfo/Record on firmwares that do not support PUT /SetUp
      const fallbackRes = await this.request(`/ISAPI/AccessControl/UserInfo/Record?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userPayload),
      });
      if (!fallbackRes.ok) {
        const errBody = await fallbackRes.text().catch(() => '');
        throw new Error(
          `Hikvision UserInfo failed (${fallbackRes.status}): ${errBody.slice(0, 300)}`,
        );
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

    const cardRes = await this.request(`/ISAPI/AccessControl/CardInfo/Record?format=json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardPayload),
    });

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

    const res = await this.request(`/ISAPI/AccessControl/UserInfoDetail/Delete?format=json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UserInfoDetail: {
          mode: 'byEmployeeNo',
          EmployeeNoList: [{ employeeNo }],
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Hikvision Delete failed (${res.status}): ${errBody.slice(0, 300)}`);
    }
  }

  async openDoor(doorNo = 1): Promise<void> {
    const res = await this.request(`/ISAPI/AccessControl/RemoteControl/door/${doorNo}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml' },
      body: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Hikvision RemoteControl failed (${res.status}): ${errBody.slice(0, 300)}`);
    }
  }
}
