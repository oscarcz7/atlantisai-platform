import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { type TenantContext } from '@noah/domain';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    if (process.env['DATABASE_URL']) {
      await this.$connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Executes a callback inside a transaction with PostgreSQL RLS tenant context set.
   */
  async withTenant<T>(
    ctx: TenantContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
      return fn(tx);
    }, options);
  }
}
