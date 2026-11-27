import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  GatewayAckDto,
  GatewayEventsDto,
  GatewayHeartbeatDto,
  OpenDoorDto,
  UpsertReaderDto,
  isForbiddenReaderIp,
} from './access.dto.js';

const OPTS = { whitelist: true, forbidNonWhitelisted: true };
const ID = '01936a3c-7b2e-7f00-8000-000000000001';
const AMENITY = '01936a3c-7b2e-7f00-8000-0000000000aa';

async function errors<T extends object>(cls: new () => T, payload: unknown) {
  return validate(plainToInstance(cls, payload) as object, OPTS);
}

// Mirrors apps/web/app/dashboard/access/page.tsx handleSave (JSON.stringify drops undefined).
const webReader = {
  code: 'PISCINA-01',
  name: 'Lector piscina',
  ip: '192.168.1.64',
  protocol: 'http',
  port: 80,
  doorNo: 1,
  amenityIds: [AMENITY],
};

describe('UpsertReaderDto', () => {
  it('accepts the web dashboard payload (create and edit)', async () => {
    expect(await errors(UpsertReaderDto, webReader)).toHaveLength(0);
    expect(
      await errors(UpsertReaderDto, { ...webReader, id: ID, serial: 'DS-K1T344', protocol: 'https', port: 443 }),
    ).toHaveLength(0);
  });

  it('accepts private LAN addresses', async () => {
    for (const ip of ['10.0.0.5', '172.16.4.2', '192.168.100.200', 'fd12:3456::1']) {
      expect(await errors(UpsertReaderDto, { ...webReader, ip })).toHaveLength(0);
    }
  });

  it('rejects missing code', async () => {
    const { code: _code, ...rest } = webReader;
    const errs = await errors(UpsertReaderDto, rest);
    expect(errs.map((e) => e.property)).toContain('code');
  });

  it('rejects loopback / link-local / metadata / unspecified IPs', async () => {
    for (const ip of ['169.254.169.254', '127.0.0.1', '127.10.0.1', '0.0.0.0', '::1', '::', 'fe80::1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', 'fd00:ec2::254']) {
      const errs = await errors(UpsertReaderDto, { ...webReader, ip });
      expect(errs.map((e) => e.property), ip).toContain('ip');
    }
  });

  it('rejects non-IP hosts, bad port, bad door, bad protocol, unknown fields', async () => {
    expect((await errors(UpsertReaderDto, { ...webReader, ip: 'metadata.google.internal' }))[0]?.property).toBe('ip');
    expect((await errors(UpsertReaderDto, { ...webReader, port: 70000 }))[0]?.property).toBe('port');
    expect((await errors(UpsertReaderDto, { ...webReader, port: '80' }))[0]?.property).toBe('port');
    expect((await errors(UpsertReaderDto, { ...webReader, doorNo: 0 }))[0]?.property).toBe('doorNo');
    expect((await errors(UpsertReaderDto, { ...webReader, protocol: 'ftp' }))[0]?.property).toBe('protocol');
    expect((await errors(UpsertReaderDto, { ...webReader, amenityIds: ['x'] }))[0]?.property).toBe('amenityIds');
    expect((await errors(UpsertReaderDto, { ...webReader, extra: 1 }))[0]?.property).toBe('extra');
  });
});

describe('isForbiddenReaderIp', () => {
  it('classifies addresses', () => {
    expect(isForbiddenReaderIp('192.168.1.64')).toBe(false);
    expect(isForbiddenReaderIp('169.254.1.1')).toBe(true);
    expect(isForbiddenReaderIp('not-an-ip')).toBe(true);
  });
});

describe('OpenDoorDto', () => {
  it('accepts the web payload and an empty body', async () => {
    expect(await errors(OpenDoorDto, { reason: 'Prueba de apertura remota PoC' })).toHaveLength(0);
    expect(await errors(OpenDoorDto, {})).toHaveLength(0);
  });
  it('rejects overlong or non-string reasons', async () => {
    expect(await errors(OpenDoorDto, { reason: 'x'.repeat(501) })).not.toHaveLength(0);
    expect(await errors(OpenDoorDto, { reason: 5 })).not.toHaveLength(0);
  });
});

describe('Gateway DTOs (payloads from apps/gateway/src/index.ts)', () => {
  it('accepts ack payloads', async () => {
    expect(await errors(GatewayAckDto, { ok: true })).toHaveLength(0);
    expect(await errors(GatewayAckDto, { ok: false, error: 'Comando sin lector asociado' })).toHaveLength(0);
  });
  it('rejects bad ack payloads', async () => {
    expect(await errors(GatewayAckDto, {})).not.toHaveLength(0);
    expect(await errors(GatewayAckDto, { ok: 'yes' })).not.toHaveLength(0);
    expect(await errors(GatewayAckDto, { ok: false, error: 'e'.repeat(1001) })).not.toHaveLength(0);
  });

  it('accepts heartbeat payloads', async () => {
    expect(
      await errors(GatewayHeartbeatDto, {
        readers: [
          { readerId: ID, online: true, firmware: 'V1.2.3' },
          { readerId: ID, online: false },
          { code: 'PISCINA-01', online: true },
        ],
      }),
    ).toHaveLength(0);
  });
  it('rejects bad heartbeat payloads', async () => {
    expect(await errors(GatewayHeartbeatDto, {})).not.toHaveLength(0);
    expect(await errors(GatewayHeartbeatDto, { readers: [{ readerId: ID }] })).not.toHaveLength(0);
    expect(await errors(GatewayHeartbeatDto, { readers: [{ online: true, hacked: 1 }] })).not.toHaveLength(0);
    expect(
      await errors(GatewayHeartbeatDto, { readers: Array.from({ length: 201 }, () => ({ online: true })) }),
    ).not.toHaveLength(0);
  });

  const event = {
    readerId: ID,
    readerCode: 'PISCINA-01',
    employeeNo: 'R12345',
    credentialCode: 'ABC',
    result: 'GRANTED',
    occurredAt: '2026-11-26T10:00:00.000Z',
    rawPayload: { AccessControllerEvent: { majorEventType: 5, nested: [1, 2] } },
  };

  it('accepts event payloads (rawPayload is free-form)', async () => {
    expect(await errors(GatewayEventsDto, { events: [event, { result: 'DENIED', occurredAt: '2026-11-26T10:00:00-05:00' }] })).toHaveLength(0);
    expect(await errors(GatewayEventsDto, { events: [] })).toHaveLength(0);
  });
  it('rejects bad event payloads', async () => {
    expect(await errors(GatewayEventsDto, { events: [{ ...event, result: 'MAYBE' }] })).not.toHaveLength(0);
    expect(await errors(GatewayEventsDto, { events: [{ ...event, occurredAt: 'ayer' }] })).not.toHaveLength(0);
    expect(await errors(GatewayEventsDto, { events: 'nope' })).not.toHaveLength(0);
    expect(await errors(GatewayEventsDto, { events: Array.from({ length: 501 }, () => event) })).not.toHaveLength(0);
  });
});
