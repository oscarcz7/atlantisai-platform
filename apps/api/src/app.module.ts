import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { QueueModule } from './common/queue/queue.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [PrismaModule, QueueModule, HealthModule],
})
export class AppModule {}
