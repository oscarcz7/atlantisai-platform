import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { type PrismaService } from '../../common/prisma/prisma.service.js';

describe('HealthController', () => {
  it('returns ok on /health', () => {
    const prisma = { $queryRaw: vi.fn() } as unknown as PrismaService;
    const controller = new HealthController(prisma);
    const result = controller.health();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('noah-api');
  });

  it('returns ready when database responds', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } as unknown as PrismaService;
    const controller = new HealthController(prisma);
    const result = await controller.ready();
    expect(result.status).toBe('ready');
    expect(result.database).toBe('ok');
  });

  it('throws 503 when database is unreachable', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as PrismaService;
    const controller = new HealthController(prisma);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
