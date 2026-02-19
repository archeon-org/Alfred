import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { interceptors } from './common/interceptors/global.interceptor';
import { setupSwagger } from './common/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable clustering for better concurrency
    logger: ['error', 'warn', 'log'],
  });

  const globalPrefix = 'api';
  const isProduction = process.env.NODE_ENV === 'production';

  // Security middleware - Helmet for HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: isProduction
      ? [
          'https://archeon.app',
          'https://www.archeon.app',
          'https://api.archeon.app',
        ]
      : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-API-Key'],
    credentials: true,
    maxAge: 86400, // 24 hours
  });

  app.setGlobalPrefix(globalPrefix);
  app.useGlobalInterceptors(...interceptors);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  setupSwagger(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
