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
    // Error objects serialize to "{}" with JSON.stringify: keep name/message/stack so startup
    // crashes and unhandled exceptions are diagnosable in Cloud Logging.
    const isError = message instanceof Error;
    const entry = {
      timestamp: new Date().toISOString(),
      severity,
      context: context ?? 'App',
      message: isError
        ? `${message.name}: ${message.message}`
        : typeof message === 'string'
          ? message
          : JSON.stringify(message),
      ...(stack || isError ? { stack: stack ?? (message as Error).stack } : {}),
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
