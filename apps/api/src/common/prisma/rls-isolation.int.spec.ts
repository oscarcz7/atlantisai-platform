import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from './prisma.service.js';

/**
 * Constitution Principle I:
 * Demonstrates with two tenants that querying as Tenant A without a WHERE clause
 * never returns rows belonging to Tenant B, enforced by PostgreSQL RLS.
 */
describe('Multi-tenant RLS isolation', () => {
  const prisma = new PrismaService();
  const tenantAId = generateUuidV7();
  const tenantBId = generateUuidV7();

  const ctxA: TenantContext = {
    tenantId: tenantAId,
    actorType: 'SYSTEM',
    actorId: 'test-runner',
    channel: 'SYSTEM',
  };

  const ctxB: TenantContext = {
    tenantId: tenantBId,
    actorType: 'SYSTEM',
    actorId: 'test-runner',
    channel: 'SYSTEM',
  };

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantAId, code: `rls-a-${tenantAId.slice(0, 8)}`, name: 'Edificio A' },
        { id: tenantBId, code: `rls-b-${tenantBId.slice(0, 8)}`, name: 'Edificio B' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await prisma.$disconnect();
  });

  it('prevents cross-tenant reads even without a WHERE filter', async () => {
    const logAId = generateUuidV7();
    const logBId = generateUuidV7();

    await prisma.withTenant(ctxA, (tx) =>
      tx.auditLog.create({
        data: {
          id: logAId,
          tenantId: tenantAId,
          actorType: 'SYSTEM',
          actorId: 'test',
          action: 'TEST_A',
          entity: 'Tenant',
          entityId: tenantAId,
          channel: 'SYSTEM',
        },
      }),
    );

    await prisma.withTenant(ctxB, (tx) =>
      tx.auditLog.create({
        data: {
          id: logBId,
          tenantId: tenantBId,
          actorType: 'SYSTEM',
          actorId: 'test',
          action: 'TEST_B',
          entity: 'Tenant',
          entityId: tenantBId,
          channel: 'SYSTEM',
        },
      }),
    );

    // Intentionally query WITHOUT a WHERE clause; RLS must isolate rows.
    const rowsVisibleToA = await prisma.withTenant(ctxA, (tx) => tx.auditLog.findMany());
    const rowsVisibleToB = await prisma.withTenant(ctxB, (tx) => tx.auditLog.findMany());

    expect(rowsVisibleToA.map((r) => r.id)).toContain(logAId);
    expect(rowsVisibleToA.map((r) => r.id)).not.toContain(logBId);

    expect(rowsVisibleToB.map((r) => r.id)).toContain(logBId);
    expect(rowsVisibleToB.map((r) => r.id)).not.toContain(logAId);
  });

  it('blocks writing a row with a mismatched tenant_id', async () => {
    await expect(
      prisma.withTenant(ctxA, (tx) =>
        tx.auditLog.create({
          data: {
            id: generateUuidV7(),
            tenantId: tenantBId, // Mismatch: context is Tenant A
            actorType: 'SYSTEM',
            actorId: 'test',
            action: 'ILLEGAL_CROSS_WRITE',
            entity: 'Tenant',
            entityId: tenantBId,
            channel: 'SYSTEM',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
