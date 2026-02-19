import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';

const logger = new Logger('Swagger');

type Environment = 'local' | 'development' | 'production';

function getServerUrl(env: Environment, port: string | number): string {
  switch (env) {
    case 'local':
      return `http://localhost:${port}`;
    case 'development':
      return 'https://dev-api.archeon.app';
    case 'production':
      return 'https://api.archeon.app';
  }
}

function getServerLabel(env: Environment): string {
  switch (env) {
    case 'local':
      return 'Local';
    case 'development':
      return 'Development';
    case 'production':
      return 'Production';
  }
}

export function setupSwagger(app: INestApplication): void {
  const env = (process.env.NODE_ENV || 'local') as Environment;
  const port = process.env.PORT || 3000;
  const docsPath = 'docs';

  // Production: Swagger is always disabled
  if (env === 'production') {
    logger.log('Swagger is disabled in production');
    return;
  }

  // Development: protect docs with basic auth
  if (env === 'development') {
    const docsUser = process.env.DOCS_USER;
    const docsPassword = process.env.DOCS_PASSWORD;

    if (!docsUser || !docsPassword) {
      logger.warn(
        'DOCS_USER and DOCS_PASSWORD are required in development — Swagger disabled',
      );
      return;
    }

    app.use(
      [`/${docsPath}`, `/${docsPath}-json`, `/${docsPath}-yaml`],
      basicAuth({
        challenge: true,
        users: { [docsUser]: docsPassword },
        realm: 'Archeon API Documentation',
      }),
    );
    logger.log('Swagger docs protected with basic auth');
  }

  // Local: no auth, open access

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
    .addServer(getServerUrl(env, port), getServerLabel(env))
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

  logger.log(
    `📚 Swagger docs available at: http://localhost:${port}/${docsPath}`,
  );
}
