import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';
import {
  type JobHandler,
  type JobPayload,
  type JobQueue,
  SYSTEM_HEARTBEAT_QUEUE,
} from './job-queue.interface.js';

@Injectable()
export class PgBossJobQueue implements JobQueue, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossJobQueue.name);
  private boss: PgBoss | null = null;

  async onModuleInit(): Promise<void> {
    if (process.env['NODE_ENV'] === 'test' || !process.env['DATABASE_URL']) {
      return;
    }
    await this.start();
    await this.work(SYSTEM_HEARTBEAT_QUEUE, async (payload) => {
      this.logger.log(JSON.stringify({ event: 'job.heartbeat', tenantId: payload.tenantId }));
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString || this.boss) {
      return;
    }
    this.boss = new PgBoss({ connectionString, schema: 'pgboss' });
    this.boss.on('error', (error) => {
      this.logger.error(JSON.stringify({ event: 'pgboss.error', message: error.message }));
    });
    await this.boss.start();
  }

  async stop(): Promise<void> {
    if (this.boss) {
      await this.boss.stop();
      this.boss = null;
    }
  }

  async enqueue<T extends JobPayload>(queueName: string, payload: T): Promise<string | null> {
    if (!this.boss) {
      return null;
    }
    await this.boss.createQueue(queueName);
    return this.boss.send(queueName, payload);
  }

  async work<T extends JobPayload>(queueName: string, handler: JobHandler<T>): Promise<void> {
    if (!this.boss) {
      return;
    }
    await this.boss.createQueue(queueName);
    await this.boss.work(queueName, async (jobs) => {
      for (const job of jobs) {
        await handler(job.data as T);
      }
    });
  }
}
