import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { QueueModule } from './common/queue/queue.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [PrismaModule, QueueModule, AuthModule, HealthModule],
})
export class AppModule {}
