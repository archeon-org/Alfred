import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { interceptors } from './common/interceptors/global.interceptor';

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

  // Swagger Documentation Setup - Protected in production
  const docsPath = 'docs';
  const docsUser = process.env.DOCS_USER || 'archeon';
  const docsPassword = process.env.DOCS_PASSWORD || 'archeon-docs-2024';

  // Protect docs with basic auth in production
  if (isProduction) {
    app.use(
      [`/${docsPath}`, `/${docsPath}-json`, `/${docsPath}-yaml`],
      basicAuth({
        challenge: true,
        users: { [docsUser]: docsPassword },
        realm: 'Archeon API Documentation',
      }),
    );
  }

  const config = new DocumentBuilder()
    .setTitle('Archeon Gate API')
    .setDescription(
      `
## Overview
Gate is the main backend API for Archeon, handling authentication, document management, 
and intelligent search powered by RAG (Retrieval-Augmented Generation).

## Authentication
- **JWT Bearer**: Standard authentication for most endpoints
- **Google OAuth**: Social login via Google
- **OTP**: Phone-based one-time password authentication

## Rate Limits
- Standard: 100 requests per minute
- Search endpoints: 30 requests per minute
- File uploads: 10 requests per minute
- Auth endpoints: 20 requests per minute

## Security
- All endpoints require authentication unless marked as public
- Rate limiting is enforced per user/IP
- Request validation with strict input sanitization
    `.trim(),
    )
    .setVersion('1.0.0')
    .setContact('Archeon Team', 'https://archeon.app', 'support@archeon.app')
    .setLicense('UNLICENSED', '')
    .addServer(
      isProduction ? 'https://api.archeon.app' : 'http://localhost:3000',
      isProduction ? 'Production' : 'Local Development',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addOAuth2(
      {
        type: 'oauth2',
        flows: {
          implicit: {
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            scopes: {
              email: 'Access email address',
              profile: 'Access user profile',
            },
          },
        },
      },
      'Google-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Internal-API-Key',
        in: 'header',
        description: 'Internal service-to-service authentication',
      },
      'Internal-auth',
    )
    .addTag('auth', 'Authentication & Authorization')
    .addTag('documents', 'Document Management & File Upload')
    .addTag('search', 'Intelligent Search & RAG')
    .addTag('user', 'User Profile Management')
    .addTag('categories', 'Document Categories')
    .addTag('tags', 'Document Tags')
    .addTag('subscription', 'Subscription & Billing')
    .addTag('health', 'Health Checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(docsPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'Archeon Gate API Documentation',
    customfavIcon: 'https://archeon.app/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 30px 0 }
      .swagger-ui .info .title { font-size: 2.5em }
    `,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(
    `📚 Swagger docs available at: http://localhost:${port}/${docsPath}`,
  );
  if (isProduction) {
    Logger.log('🔒 API documentation is protected with basic auth');
  }
}

bootstrap();
