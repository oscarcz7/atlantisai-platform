import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonLogger } from './json-logger.service.js';

describe('JsonLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the message and stack of Error objects (not "{}")', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    new JsonLogger().error(new Error('boom'), undefined, 'Test');
    const entry = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(entry.message).toBe('Error: boom');
    expect(entry.stack).toContain('boom');
    expect(entry.severity).toBe('ERROR');
  });
});
