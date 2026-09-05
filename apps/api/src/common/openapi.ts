import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const BEARER_AUTH_NAME = 'bearerAuth';

export function isOpenApiEnabled(config: ConfigService): boolean {
  return (
    config.getOrThrow<string>('NODE_ENV') !== 'production' &&
    config.getOrThrow<boolean>('FEATURE_OPENAPI_ENABLED')
  );
}

export function configureOpenApi(app: INestApplication): void {
  const config = app.get(ConfigService);
  if (!isOpenApiEnabled(config)) return;

  const prefix = config.getOrThrow<string>('API_PREFIX');
  const documentConfig = new DocumentBuilder()
    .setTitle('Alfred API')
    .setDescription('HTTP API for the self-hosted Alfred platform.')
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        bearerFormat: 'JWT',
        description: 'Short-lived Alfred access token.',
        scheme: 'bearer',
        type: 'http',
      },
      BEARER_AUTH_NAME,
    )
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig);

  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    customSiteTitle: 'Alfred API documentation',
    jsonDocumentUrl: `${prefix}/docs-json`,
    swaggerOptions: {
      persistAuthorization: false,
    },
  });
}
