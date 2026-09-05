import { type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const prefix = config.getOrThrow<string>('API_PREFIX');

  const trustedProxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (trustedProxyHops > 0) {
    (app as NestExpressApplication).set('trust proxy', trustedProxyHops);
  }

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    maxAge: 600,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: config.getOrThrow<readonly string[]>('API_CORS_ORIGINS'),
  });
  app.setGlobalPrefix(prefix, {
    exclude: [
      { method: RequestMethod.GET, path: 'health' },
      { method: RequestMethod.GET, path: 'health/live' },
      { method: RequestMethod.GET, path: 'health/ready' },
      { method: RequestMethod.GET, path: 'metrics' },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();
}
