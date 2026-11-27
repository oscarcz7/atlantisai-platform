export interface JobPayload {
  readonly tenantId?: string;
  readonly [key: string]: unknown;
}

export type JobHandler<T extends JobPayload = JobPayload> = (payload: T) => Promise<void>;

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueue<T extends JobPayload>(queueName: string, payload: T): Promise<string | null>;
  work<T extends JobPayload>(queueName: string, handler: JobHandler<T>): Promise<void>;
  /** Registers a cluster-wide cron schedule (only one instance runs each tick). */
  schedule(queueName: string, cron: string, payload?: JobPayload): Promise<void>;
}

export const JOB_QUEUE_TOKEN = Symbol('JOB_QUEUE_TOKEN');

export const SYSTEM_HEARTBEAT_QUEUE = 'system.heartbeat';
export const RESERVATIONS_EXPIRE_QUEUE = 'reservations.expire-holds';

/**
 * Deterministic in-memory JobQueue implementation for unit tests.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler>();
  public readonly enqueued: Array<{ queueName: string; payload: JobPayload }> = [];

  async start(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    return;
  }

  async enqueue<T extends JobPayload>(queueName: string, payload: T): Promise<string | null> {
    this.enqueued.push({ queueName, payload });
    const handler = this.handlers.get(queueName);
    if (handler) {
      await handler(payload);
    }
    return `mem-${this.enqueued.length}`;
  }

  async work<T extends JobPayload>(queueName: string, handler: JobHandler<T>): Promise<void> {
    this.handlers.set(queueName, handler as JobHandler);
  }

  public readonly schedules: Array<{ queueName: string; cron: string }> = [];
  async schedule(queueName: string, cron: string): Promise<void> {
    this.schedules.push({ queueName, cron });
  }
}
