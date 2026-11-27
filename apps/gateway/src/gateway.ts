import {
  checkReaderTarget,
  type AllowlistEntry,
  type GatewayConfig,
  type ReaderProtocol,
} from './config.js';
import type { AccessControlDevice } from './device.interface.js';
import { FakeDevice } from './fake-device.js';
import { describeError, HikvisionIsapiDevice } from './hikvision-isapi.device.js';

export type CommandType =
  'UPSERT_CREDENTIAL' | 'REVOKE_CREDENTIAL' | 'OPEN_DOOR' | 'PING' | 'PURGE';

export interface PulledReader {
  id: string;
  code: string;
  name: string;
  protocol: string;
  ip: string;
  port: number;
  doorNo: number;
}

export interface PulledCommand {
  id: string;
  idempotencyKey: string;
  type: CommandType | string;
  payload: Record<string, unknown>;
  reader: PulledReader | null;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export interface ResolvedReader {
  readerId?: string;
  code: string;
  protocol: ReaderProtocol;
  ip: string;
  port: number;
  entry: AllowlistEntry | null;
}

export type DeviceFactory = (reader: ResolvedReader, config: GatewayConfig) => AccessControlDevice;

export interface ApiClient {
  request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface Logger {
  info(msg: string): void;
  error(msg: string): void;
}

export const REMOTE_OPEN_DISABLED = 'remote open disabled on this gateway';
export const PURGE_NOT_IMPLEMENTED =
  'PURGE not implemented on this gateway (device interface cannot list/delete by prefix safely yet)';

const MAX_ERROR_LENGTH = 1000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** HTTP client for the cloud API; every call is bounded by AbortSignal.timeout. */
export function createApiClient(
  config: Pick<GatewayConfig, 'apiUrl' | 'apiToken' | 'tenant' | 'httpTimeoutMs'>,
  fetchImpl: typeof fetch = fetch,
): ApiClient {
  return {
    async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
      let res: Response;
      try {
        res = await fetchImpl(`${config.apiUrl}${path}`, {
          method: init?.method ?? 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-gateway-token': config.apiToken,
            // Ignored by the API for per-tenant tokens (tenant is derived from the token);
            // only honoured for the legacy shared dev token.
            'x-tenant-id': config.tenant,
          },
          body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal: AbortSignal.timeout(config.httpTimeoutMs),
        });
      } catch (err) {
        throw new ApiError(`API request ${path} failed: ${describeError(err)}`);
      }
      let data: (T & { message?: string }) | undefined;
      try {
        data = (await res.json()) as T & { message?: string };
      } catch (err) {
        if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
          throw new ApiError(`API request ${path} failed: timeout`, res.status);
        }
        data = undefined;
      }
      if (!res.ok) {
        throw new ApiError(`API ${res.status}: ${data?.message ?? res.statusText}`, res.status);
      }
      return (data ?? ({} as T)) as T;
    },
  };
}

export const defaultDeviceFactory: DeviceFactory = (reader, config) =>
  config.mode === 'hikvision'
    ? new HikvisionIsapiDevice({
        protocol: reader.protocol,
        ip: reader.ip,
        port: reader.port,
        credentials: { username: config.hikUser, password: config.hikPass },
        employeePrefix: config.employeePrefix,
        timeoutMs: config.httpTimeoutMs,
        ...(reader.entry?.tls ? { tls: reader.entry.tls } : {}),
      })
    : new FakeDevice(reader.code, config.employeePrefix);

function truncate(msg: string): string {
  return msg.length > MAX_ERROR_LENGTH ? `${msg.slice(0, MAX_ERROR_LENGTH - 3)}...` : msg;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== 'string' && typeof v !== 'number') {
    throw new Error(`payload.${key} is required`);
  }
  const s = String(v).trim();
  if (!s) throw new Error(`payload.${key} is required`);
  return s;
}

function requireDate(payload: Record<string, unknown>, key: string): Date {
  const d = new Date(String(payload[key] ?? ''));
  if (Number.isNaN(d.getTime())) throw new Error(`payload.${key} is not a valid date`);
  return d;
}

function doorNoFrom(payload: Record<string, unknown>, reader: PulledReader): number {
  const n = Number(payload['doorNo'] ?? reader.doorNo ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 64) throw new Error('payload.doorNo is invalid');
  return n;
}

export class Gateway {
  private readonly deviceCache = new Map<string, AccessControlDevice>();
  /** Readers seen in commands (by reader id) or declared with a code in the readers file. */
  private readonly knownReaders = new Map<string, ResolvedReader>();
  private polling = false;
  private heartbeating = false;
  private stopping = false;
  private pollTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: GatewayConfig,
    private readonly api: ApiClient,
    private readonly deviceFactory: DeviceFactory = defaultDeviceFactory,
    private readonly log: Logger = {
      info: (m) => console.log(m),
      error: (m) => console.error(m),
    },
  ) {
    for (const entry of config.allowlist) {
      if (!entry.code) continue;
      const protocol = entry.protocol ?? 'http';
      const port = entry.port ?? (protocol === 'https' ? 443 : 80);
      this.knownReaders.set(`code:${entry.code}`, {
        code: entry.code,
        protocol,
        ip: entry.ip,
        port,
        entry,
      });
    }
  }

  get isBusy(): boolean {
    return this.polling || this.heartbeating;
  }

  private getDevice(reader: ResolvedReader): AccessControlDevice {
    const key = `${this.config.mode}:${reader.readerId ?? reader.code}:${reader.protocol}:${reader.ip}:${reader.port}`;
    let device = this.deviceCache.get(key);
    if (!device) {
      device = this.deviceFactory(reader, this.config);
      this.deviceCache.set(key, device);
    }
    return device;
  }

  /** Validates the command target against the local allowlist. Never touches the network. */
  resolveReader(reader: PulledReader): ResolvedReader | { error: string } {
    const decision = checkReaderTarget(
      reader,
      this.config.allowlist,
      this.config.mode === 'hikvision' || this.config.allowlist.length > 0,
    );
    if (!decision.ok) return { error: decision.error };
    return {
      readerId: reader.id,
      code: reader.code,
      protocol: decision.protocol,
      ip: decision.ip,
      port: decision.port,
      entry: decision.entry,
    };
  }

  /** Executes one command and returns the ack body. Never throws. */
  async executeCommand(cmd: PulledCommand): Promise<CommandResult> {
    try {
      switch (cmd.type) {
        case 'PURGE':
          return { ok: false, error: PURGE_NOT_IMPLEMENTED };
        case 'OPEN_DOOR':
          if (!this.config.allowRemoteOpen) return { ok: false, error: REMOTE_OPEN_DISABLED };
          break;
        case 'UPSERT_CREDENTIAL':
        case 'REVOKE_CREDENTIAL':
        case 'PING':
          break;
        default:
          return { ok: false, error: `unknown command type "${String(cmd.type)}"` };
      }

      if (!cmd.reader) return { ok: false, error: 'Comando sin lector asociado' };
      const resolved = this.resolveReader(cmd.reader);
      if ('error' in resolved) return { ok: false, error: resolved.error };

      this.knownReaders.set(`id:${cmd.reader.id}`, resolved);
      const device = this.getDevice(resolved);
      const payload = cmd.payload ?? {};

      switch (cmd.type) {
        case 'UPSERT_CREDENTIAL': {
          const validFrom = requireDate(payload, 'validFrom');
          const validTo = requireDate(payload, 'validTo');
          if (validTo.getTime() <= validFrom.getTime())
            throw new Error('payload.validTo must be after validFrom');
          await device.upsertCredential({
            employeeNo: requireString(payload, 'employeeNo'),
            cardNo: requireString(payload, 'cardNo'),
            name: payload['name'] ? String(payload['name']) : undefined,
            validFrom,
            validTo,
            doorNo: doorNoFrom(payload, cmd.reader),
          });
          return { ok: true };
        }
        case 'REVOKE_CREDENTIAL':
          await device.revokeCredential(requireString(payload, 'employeeNo'));
          return { ok: true };
        case 'OPEN_DOOR':
          await device.openDoor(doorNoFrom(payload, cmd.reader));
          return { ok: true };
        case 'PING': {
          const status = await device.getStatus();
          return status.online
            ? { ok: true }
            : { ok: false, error: `reader unreachable: ${status.error ?? 'offline'}` };
        }
      }
      return { ok: false, error: 'unreachable' };
    } catch (err) {
      return { ok: false, error: truncate(describeError(err)) };
    }
  }

  private async ack(cmd: PulledCommand, result: CommandResult): Promise<void> {
    const body: CommandResult = result.ok
      ? { ok: true }
      : { ok: false, error: truncate(result.error ?? 'error') };
    await this.api.request(`/access/gateway/commands/${encodeURIComponent(cmd.id)}/ack`, {
      method: 'POST',
      body,
    });
  }

  /** Pulls and processes one batch. Each command is isolated: a failed ACK doesn't stop the batch. */
  async processOnce(): Promise<void> {
    const commands = await this.api.request<PulledCommand[]>(`/access/gateway/commands?limit=20`);
    if (!Array.isArray(commands)) throw new Error('API returned a non-array command list');

    for (const cmd of commands) {
      if (this.stopping) break;
      const result = await this.executeCommand(cmd);
      const readerCode = cmd.reader?.code ?? '-';
      if (result.ok) {
        this.log.info(`[Gateway] OK cmd=${cmd.id} type=${cmd.type} reader=${readerCode}`);
      } else {
        this.log.error(
          `[Gateway] FAIL cmd=${cmd.id} type=${cmd.type} reader=${readerCode}: ${result.error}`,
        );
      }
      try {
        await this.ack(cmd, result);
      } catch (err) {
        // The API will hand the command out again (still PENDING/DISPATCHED); commands are idempotent.
        this.log.error(`[Gateway] ACK failed cmd=${cmd.id}: ${describeError(err)}`);
      }
    }
  }

  /** Builds the heartbeat body with the current status of every known reader. */
  async collectHeartbeat(): Promise<{
    readers: Array<{ readerId?: string; code?: string; online: boolean; firmware?: string }>;
  }> {
    const readers = [...this.knownReaders.values()];
    // Readers seen in commands supersede code-only entries for the same address.
    const seen = new Set(readers.filter((r) => r.readerId).map((r) => `${r.ip}:${r.port}`));
    const targets = readers.filter((r) => r.readerId || !seen.has(`${r.ip}:${r.port}`));
    const statuses = await Promise.all(
      targets.map(async (r) => {
        const status = await this.getDevice(r)
          .getStatus()
          .catch((err: unknown) => ({
            online: false,
            firmware: undefined,
            error: describeError(err),
          }));
        return {
          ...(r.readerId ? { readerId: r.readerId } : { code: r.code }),
          online: status.online,
          ...(status.firmware ? { firmware: status.firmware } : {}),
        };
      }),
    );
    return { readers: statuses.slice(0, 200) };
  }

  async sendHeartbeat(): Promise<void> {
    if (this.heartbeating || this.stopping) return;
    this.heartbeating = true;
    try {
      const body = await this.collectHeartbeat();
      await this.api.request('/access/gateway/heartbeat', { method: 'POST', body });
    } catch (err) {
      this.log.error(`[Gateway] Heartbeat failed: ${describeError(err)}`);
    } finally {
      this.heartbeating = false;
    }
  }

  async pollOnce(): Promise<void> {
    if (this.polling || this.stopping) return;
    this.polling = true;
    try {
      await this.processOnce();
    } catch (err) {
      this.log.error(`[Gateway] Error en ciclo de polling: ${describeError(err)}`);
    } finally {
      this.polling = false;
    }
  }

  start(): void {
    void this.pollOnce();
    void this.sendHeartbeat();
    this.pollTimer = setInterval(() => void this.pollOnce(), this.config.pollMs);
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), this.config.heartbeatMs);
  }

  stop(): void {
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
}
