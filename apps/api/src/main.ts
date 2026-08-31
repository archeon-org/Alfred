import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  configureApplication(app);

  await app.listen(config.getOrThrow<number>('API_PORT'), config.getOrThrow<string>('API_HOST'));
}

void bootstrap();
