import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleMailer } from './mailer.interface.js';

describe('ConsoleMailer', () => {
  const env = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = env;
    vi.restoreAllMocks();
  });

  it('never logs the one-time token or the full e-mail in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const spies = [
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
    ];
    const mailer = new ConsoleMailer();
    await mailer.sendPasswordReset({ to: 'admin@example.com', fullName: 'A', resetToken: 'SECRET-TOKEN' });
    await mailer.sendInvitation({ to: 'admin@example.com', fullName: 'A', inviteToken: 'SECRET-INVITE' });
    const output = spies.flatMap((s) => s.mock.calls.map((c) => String(c[0]))).join('\n');
    expect(output).not.toContain('SECRET-TOKEN');
    expect(output).not.toContain('SECRET-INVITE');
    expect(output).not.toContain('admin@example.com');
    expect(output).toContain('a***@example.com');
  });
});
