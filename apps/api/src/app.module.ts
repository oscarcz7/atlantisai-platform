import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { QueueModule } from './common/queue/queue.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CadastreModule } from './modules/cadastre/cadastre.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IncidentsModule } from './modules/incidents/incidents.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { VisitsModule } from './modules/visits/visits.module.js';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    AuthModule,
    TenantsModule,
    CatalogModule,
    CadastreModule,
    ReservationsModule,
    BillingModule,
    VisitsModule,
    IncidentsModule,
    AuditModule,
    HealthModule,
  ],
})
export class AppModule {}
