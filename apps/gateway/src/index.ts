import type { AccessControlDevice } from './device.interface.js';
import { FakeDevice } from './fake-device.js';
import { HikvisionIsapiDevice } from './hikvision-isapi.device.js';

interface PulledCommand {
  id: string;
  idempotencyKey: string;
  type: 'UPSERT_CREDENTIAL' | 'REVOKE_CREDENTIAL' | 'OPEN_DOOR' | 'PING' | 'PURGE';
  payload: Record<string, unknown>;
  reader: {
    id: string;
    code: string;
    name: string;
    protocol: string;
    ip: string;
    port: number;
    doorNo: number;
  } | null;
}

const API_URL = (process.env['GATEWAY_API_URL'] || 'http://localhost:4000').replace(/\/$/, '');
const GATEWAY_TOKEN = process.env['GATEWAY_API_TOKEN'] || 'dev-gateway-token';
const TENANT = process.env['GATEWAY_TENANT'] || 'noah';
const MODE = (process.env['GATEWAY_MODE'] || 'fake').toLowerCase(); // 'fake' | 'hikvision'
const POLL_MS = Number(process.env['GATEWAY_POLL_MS'] || 3000);
const HIK_USER = process.env['HIKVISION_USER'] || 'admin';
const HIK_PASS = process.env['HIKVISION_PASS'] || '';
const PREFIX = process.env['HIKVISION_EMPLOYEE_PREFIX'] || 'NX';

const deviceCache = new Map<string, AccessControlDevice>();

function getDevice(reader: NonNullable<PulledCommand['reader']>): AccessControlDevice {
  const key = `${MODE}:${reader.id}:${reader.protocol}:${reader.ip}:${reader.port}`;
  const cached = deviceCache.get(key);
  if (cached) return cached;

  const device: AccessControlDevice =
    MODE === 'hikvision'
      ? new HikvisionIsapiDevice({
          protocol: reader.protocol === 'https' ? 'https' : 'http',
          ip: reader.ip,
          port: reader.port,
          credentials: { username: HIK_USER, password: HIK_PASS },
          employeePrefix: PREFIX,
        })
      : new FakeDevice(reader.code, PREFIX);

  deviceCache.set(key, device);
  return device;
}

async function apiRequest<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-gateway-token': GATEWAY_TOKEN,
      'x-tenant-id': TENANT,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${data.message ?? res.statusText}`);
  }
  return data;
}

async function processOnce(): Promise<void> {
  const commands = await apiRequest<PulledCommand[]>(`/access/gateway/commands?limit=20`);
  if (commands.length === 0) return;

  const touchedReaders = new Map<string, NonNullable<PulledCommand['reader']>>();

  for (const cmd of commands) {
    if (!cmd.reader) {
      await apiRequest(`/access/gateway/commands/${cmd.id}/ack`, {
        method: 'POST',
        body: { ok: false, error: 'Comando sin lector asociado' },
      });
      continue;
    }

    touchedReaders.set(cmd.reader.id, cmd.reader);
    const device = getDevice(cmd.reader);

    try {
      if (cmd.type === 'UPSERT_CREDENTIAL') {
        await device.upsertCredential({
          employeeNo: String(cmd.payload['employeeNo'] ?? ''),
          cardNo: String(cmd.payload['cardNo'] ?? ''),
          name: cmd.payload['name'] ? String(cmd.payload['name']) : undefined,
          validFrom: new Date(String(cmd.payload['validFrom'])),
          validTo: new Date(String(cmd.payload['validTo'])),
          doorNo: Number(cmd.payload['doorNo'] ?? cmd.reader.doorNo ?? 1),
        });
      } else if (cmd.type === 'REVOKE_CREDENTIAL') {
        await device.revokeCredential(String(cmd.payload['employeeNo'] ?? ''));
      } else if (cmd.type === 'OPEN_DOOR') {
        await device.openDoor(Number(cmd.payload['doorNo'] ?? cmd.reader.doorNo ?? 1));
      }

      await apiRequest(`/access/gateway/commands/${cmd.id}/ack`, {
        method: 'POST',
        body: { ok: true },
      });
      console.log(`[Gateway] ACK OK cmd=${cmd.id} type=${cmd.type} reader=${cmd.reader.code}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Gateway] FAIL cmd=${cmd.id} type=${cmd.type}: ${message}`);
      await apiRequest(`/access/gateway/commands/${cmd.id}/ack`, {
        method: 'POST',
        body: { ok: false, error: message },
      });
    }
  }

  // Send quick heartbeat for readers we just talked to
  const readersHeartbeat = [];
  for (const reader of touchedReaders.values()) {
    const status = await getDevice(reader).getStatus();
    readersHeartbeat.push({
      readerId: reader.id,
      online: status.online,
      firmware: status.firmware,
    });
  }
  if (readersHeartbeat.length > 0) {
    await apiRequest('/access/gateway/heartbeat', {
      method: 'POST',
      body: { readers: readersHeartbeat },
    }).catch(() => undefined);
  }
}

async function main() {
  console.log(
    `[NOAH Edge Gateway] Iniciado | mode=${MODE} | tenant=${TENANT} | api=${API_URL} | poll=${POLL_MS}ms`,
  );
  if (MODE === 'hikvision' && !HIK_PASS) {
    console.warn('[NOAH Edge Gateway] Advertencia: HIKVISION_PASS está vacío.');
  }

  // Outbound-only loop (non-overlapping ticks + graceful shutdown)
  let running = false;
  let stopping = false;

  const run = async () => {
    if (running || stopping) return;
    running = true;
    try {
      await processOnce();
    } catch (err) {
      console.error('[Gateway] Error en ciclo de polling:', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  await run();
  const timer = setInterval(() => {
    void run();
  }, POLL_MS);

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    console.log(`[NOAH Edge Gateway] Señal ${signal} recibida. Cerrando...`);
    const waitExit = setInterval(() => {
      if (!running) {
        clearInterval(waitExit);
        process.exit(0);
      }
    }, 100);
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
