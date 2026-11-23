import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { QueueModule } from './common/queue/queue.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';

@Module({
  imports: [PrismaModule, QueueModule, AuthModule, TenantsModule, CatalogModule, HealthModule],
})
export class AppModule {}
