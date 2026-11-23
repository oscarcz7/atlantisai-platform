import { describe, expect, it, vi } from 'vitest';
import { InMemoryJobQueue, SYSTEM_HEARTBEAT_QUEUE } from './job-queue.interface.js';

describe('InMemoryJobQueue', () => {
  it('enqueues and dispatches jobs to registered handlers', async () => {
    const queue = new InMemoryJobQueue();
    const handler = vi.fn().mockResolvedValue(undefined);

    await queue.work(SYSTEM_HEARTBEAT_QUEUE, handler);
    const id = await queue.enqueue(SYSTEM_HEARTBEAT_QUEUE, { tenantId: 'tenant-1', ping: true });

    expect(id).toBe('mem-1');
    expect(handler).toHaveBeenCalledWith({ tenantId: 'tenant-1', ping: true });
    expect(queue.enqueued).toHaveLength(1);
  });
});
