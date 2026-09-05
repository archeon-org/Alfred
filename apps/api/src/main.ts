import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';
import { configureOpenApi } from './common/openapi';
import { JsonLoggerService } from './observability/json-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  app.useLogger(app.get(JsonLoggerService));

  configureApplication(app);
  configureOpenApi(app);

  await app.listen(config.getOrThrow<number>('API_PORT'), config.getOrThrow<string>('API_HOST'));
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Alfred API failed to start', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
