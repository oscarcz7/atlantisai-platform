import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from './prisma.service.js';

describe('audit_logs is append-only for the app role', () => {
  const prisma = new PrismaService();
  const tenantId = generateUuidV7();
  const ctx: TenantContext = {
    tenantId,
    actorType: 'STAFF',
    actorId: 'test',
    channel: 'DASHBOARD',
    role: 'ADMIN',
  };
  let logId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.create({ data: { id: tenantId, code: `aud-${tenantId.slice(0, 8)}`, name: 'Audit test' } });
    logId = generateUuidV7();
    await prisma.withTenant(ctx, (tx) =>
      tx.auditLog.create({
        data: { id: logId, tenantId, actorType: 'STAFF', actorId: 'test', action: 'TEST', entity: 'X', entityId: 'x', channel: 'DASHBOARD' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('rejects UPDATE and DELETE', async () => {
    await expect(
      prisma.withTenant(ctx, (tx) => tx.auditLog.update({ where: { id: logId }, data: { action: 'TAMPERED' } })),
    ).rejects.toThrow();
    await expect(prisma.withTenant(ctx, (tx) => tx.auditLog.delete({ where: { id: logId } }))).rejects.toThrow();
  });

  it('keeps the trail after the tenant is deleted', async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    const rows = await prisma.withTenant(ctx, (tx) => tx.auditLog.findMany({ where: { id: logId } }));
    expect(rows).toHaveLength(1);
  });
});
