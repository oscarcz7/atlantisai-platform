import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DomainErrorFilter } from './common/filters/domain-error.filter.js';
import { JsonLogger } from './common/logging/json-logger.service.js';

async function bootstrap(): Promise<void> {
  if (process.env['SENTRY_DSN']) {
    Sentry.init({
      dsn: process.env['SENTRY_DSN'],
      environment: process.env['NODE_ENV'] ?? 'development',
    });
  }

  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableShutdownHooks();

  const port = Number(process.env['PORT'] ?? process.env['API_PORT'] ?? 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`${JSON.stringify({ severity: 'ERROR', context: 'Bootstrap', error: String(err) })}\n`);
  process.exit(1);
});
