import { Global, Module } from '@nestjs/common';
import { JOB_QUEUE_TOKEN } from './job-queue.interface.js';
import { PgBossJobQueue } from './pg-boss-job-queue.service.js';

@Global()
@Module({
  providers: [
    PgBossJobQueue,
    {
      provide: JOB_QUEUE_TOKEN,
      useExisting: PgBossJobQueue,
    },
  ],
  exports: [JOB_QUEUE_TOKEN, PgBossJobQueue],
})
export class QueueModule {}
