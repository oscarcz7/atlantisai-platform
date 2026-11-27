import { describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@noah/domain';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AccessService } from './access.service.js';

const ctx: TenantContext = {
  tenantId: '01936b2e-1234-7abc-8def-0123456789ab',
  actorType: 'STAFF',
  actorId: 'admin-1',
  channel: 'DASHBOARD',
  role: 'ADMIN',
};

describe('AccessService.triggerOpenDoor reason', () => {
  it('rejects an empty or whitespace-only reason with OPEN_DOOR_REASON_REQUIRED (422) before touching the DB', async () => {
    const withTenant = vi.fn();
    const service = new AccessService({ withTenant } as unknown as PrismaService);
    for (const reason of ['', '   ']) {
      await expect(service.triggerOpenDoor(ctx, 'reader-1', reason)).rejects.toMatchObject({
        code: 'OPEN_DOOR_REASON_REQUIRED',
        statusCode: 422,
      });
    }
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('creates the command and audits the trimmed reason', async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      reader: { findFirst: vi.fn().mockResolvedValue({ id: 'reader-1', doorNo: 1 }) },
      gatewayCommand: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data })) },
      auditLog: { create: auditCreate },
    };
    const prisma = { withTenant: (_c: TenantContext, fn: (t: typeof tx) => unknown) => fn(tx) };
    const service = new AccessService(prisma as unknown as PrismaService);
    const cmd = (await service.triggerOpenDoor(ctx, 'reader-1', '  Residente sin credencial  ')) as unknown as {
      payload: { reason: string };
    };
    expect(cmd.payload.reason).toBe('Residente sin credencial');
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'READER_REMOTE_OPEN',
          after: expect.objectContaining({ reason: 'Residente sin credencial' }),
        }),
      }),
    );
  });
});
