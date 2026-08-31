import { type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const prefix = config.getOrThrow<string>('API_PREFIX');

  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: config.getOrThrow<readonly string[]>('API_CORS_ORIGINS'),
  });
  app.setGlobalPrefix(prefix, {
    exclude: [
      { method: RequestMethod.GET, path: 'health' },
      { method: RequestMethod.GET, path: 'health/live' },
      { method: RequestMethod.GET, path: 'health/ready' },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();
}
