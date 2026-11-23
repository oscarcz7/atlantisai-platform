import { ConsoleLogger } from '@nestjs/common';

export class JsonLogger extends ConsoleLogger {
  override log(message: unknown, context?: string): void {
    this.writeJson('INFO', message, context);
  }

  override warn(message: unknown, context?: string): void {
    this.writeJson('WARN', message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    this.writeJson('ERROR', message, context, stack);
  }

  private writeJson(
    severity: 'INFO' | 'WARN' | 'ERROR',
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      severity,
      context: context ?? 'App',
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...(stack ? { stack } : {}),
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
