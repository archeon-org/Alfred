import { bodyParserErrorMiddleware } from './common/validation/body-parser-error.middleware';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { RequestValidationPipe } from './common/validation/request-validation.pipe';

function preventResponseCaching(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const prefix = config.getOrThrow<string>('API_PREFIX');

  const trustedProxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (trustedProxyHops > 0) {
    (app as NestExpressApplication).set('trust proxy', trustedProxyHops);
  }

  app.use(helmet());
  app.use(preventResponseCaching);
  app.use(cookieParser());
  // JSON escaping can expand a valid 64KiB document to six times its UTF8 size.
  (app as NestExpressApplication).useBodyParser('json', {
    limit: 1_600_000,
    type: (request: Request) =>
      Boolean(request.is('application/json')) &&
      (request.path === `/${prefix}/skills` || request.path.startsWith(`/${prefix}/skills/`)),
  });
  (app as NestExpressApplication).useBodyParser('json', { limit: 6 * 65_536 + 1024 });
  app.use(bodyParserErrorMiddleware);

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
  app.useGlobalPipes(new RequestValidationPipe());
  app.enableShutdownHooks();
}
