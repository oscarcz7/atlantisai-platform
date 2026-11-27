import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AccessService } from './access.service.js';

describe('Edge Gateway per-tenant token', () => {
  const prisma = new PrismaService();
  const access = new AccessService(prisma);
  const suffix = generateUuidV7().slice(0, 8);
  const tenantA = generateUuidV7();
  const tenantB = generateUuidV7();
  const ctxOf = (tenantId: string): TenantContext => ({
    tenantId,
    actorType: 'STAFF',
    actorId: 'test-admin',
    channel: 'DASHBOARD',
    role: 'ADMIN',
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, code: `gwa-${suffix}`, name: `GW A ${suffix}` },
        { id: tenantB, code: `gwb-${suffix}`, name: `GW B ${suffix}` },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it('derives the tenant from the token and ignores the client tenant hint', async () => {
    const { token: tokenA } = await access.rotateGatewayToken(ctxOf(tenantA));
    // A gateway of building A asking for building B still only gets building A.
    await expect(access.resolveGatewayTenant(tokenA, tenantB)).resolves.toBe(tenantA);
    await expect(access.resolveGatewayTenant(tokenA, `gwb-${suffix}`)).resolves.toBe(tenantA);
  });

  it('revokes the previous token on rotation and rejects unknown/missing tokens', async () => {
    const { token: first } = await access.rotateGatewayToken(ctxOf(tenantB));
    const { token: second } = await access.rotateGatewayToken(ctxOf(tenantB));
    await expect(access.resolveGatewayTenant(second)).resolves.toBe(tenantB);
    await expect(access.resolveGatewayTenant(first, tenantB)).rejects.toMatchObject({ code: 'INVALID_GATEWAY_TOKEN' });
    await expect(access.resolveGatewayTenant(undefined, tenantB)).rejects.toMatchObject({ code: 'INVALID_GATEWAY_TOKEN' });
  });

  it('audits rotations', async () => {
    const logs = await prisma.withTenant(ctxOf(tenantB), (tx) =>
      tx.auditLog.findMany({ where: { tenantId: tenantB, action: 'GATEWAY_TOKEN_ROTATED' } }),
    );
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });
});
