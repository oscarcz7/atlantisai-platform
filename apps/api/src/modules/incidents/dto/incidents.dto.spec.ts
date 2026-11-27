import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateIncidentDto, SubscribeIncidentDto, UpdateIncidentStatusDto } from './incidents.dto.js';

const OPTS = { whitelist: true, forbidNonWhitelisted: true };

async function errors<T extends object>(cls: new () => T, payload: unknown) {
  return validate(plainToInstance(cls, payload) as object, OPTS);
}

// Mirrors apps/web/app/dashboard/incidents/page.tsx
const webCreate = { category: 'Mantenimiento', location: 'Lobby', description: 'Foco quemado', urgency: 'MEDIUM' };

describe('CreateIncidentDto', () => {
  it('accepts the web payload and optional photos', async () => {
    expect(await errors(CreateIncidentDto, webCreate)).toHaveLength(0);
    expect(await errors(CreateIncidentDto, { ...webCreate, urgency: undefined, photos: ['https://x/y.jpg'] })).toHaveLength(0);
  });
  it('rejects missing/empty fields, bad urgency, unknown fields', async () => {
    const { description: _d, ...rest } = webCreate;
    expect((await errors(CreateIncidentDto, rest))[0]?.property).toBe('description');
    expect((await errors(CreateIncidentDto, { ...webCreate, location: '' }))[0]?.property).toBe('location');
    expect((await errors(CreateIncidentDto, { ...webCreate, urgency: 'URGENT' }))[0]?.property).toBe('urgency');
    expect((await errors(CreateIncidentDto, { ...webCreate, photos: [1] }))[0]?.property).toBe('photos');
    expect((await errors(CreateIncidentDto, { ...webCreate, tenantId: 'x' }))[0]?.property).toBe('tenantId');
  });
});

describe('UpdateIncidentStatusDto', () => {
  it('accepts the web payload', async () => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
      expect(await errors(UpdateIncidentStatusDto, { status })).toHaveLength(0);
    }
    expect(await errors(UpdateIncidentStatusDto, { status: 'IN_PROGRESS', assignedTo: 'Conserje' })).toHaveLength(0);
  });
  it('rejects bad status', async () => {
    expect(await errors(UpdateIncidentStatusDto, {})).not.toHaveLength(0);
    expect(await errors(UpdateIncidentStatusDto, { status: 'DONE' })).not.toHaveLength(0);
    expect(await errors(UpdateIncidentStatusDto, { status: 'OPEN', assignedTo: 3 })).not.toHaveLength(0);
  });
});

describe('SubscribeIncidentDto', () => {
  it('accepts a UUIDv7 personId and rejects anything else', async () => {
    expect(await errors(SubscribeIncidentDto, { personId: '01936a3c-7b2e-7f00-8000-000000000001' })).toHaveLength(0);
    expect(await errors(SubscribeIncidentDto, { personId: 'abc' })).not.toHaveLength(0);
    expect(await errors(SubscribeIncidentDto, {})).not.toHaveLength(0);
  });
});
