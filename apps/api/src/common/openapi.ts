import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import {
  API_DOCS_DESCRIPTION,
  API_DOCS_TAGS,
  applyApiDocsComponents,
} from './api-docs/api-docs.document';

const BEARER_AUTH_NAME = 'bearerAuth';

export function isOpenApiEnabled(config: ConfigService): boolean {
  return (
    config.getOrThrow<string>('NODE_ENV') !== 'production' &&
    config.getOrThrow<boolean>('FEATURE_OPENAPI_ENABLED')
  );
}

/** The document served at `/docs-json`; the contract test builds it through this same function. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Alfred API')
    .setDescription(API_DOCS_DESCRIPTION)
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        bearerFormat: 'JWT',
        description:
          'Short-lived Alfred access token (`typ: access`). Paste the token alone, without `Bearer`.',
        scheme: 'bearer',
        type: 'http',
      },
      BEARER_AUTH_NAME,
    );
  for (const [name, description] of Object.entries(API_DOCS_TAGS))
    builder.addTag(name, description);
  return applyApiDocsComponents(SwaggerModule.createDocument(app, builder.build()));
}

export function configureOpenApi(app: INestApplication): void {
  const config = app.get(ConfigService);
  if (!isOpenApiEnabled(config)) return;

  const prefix = config.getOrThrow<string>('API_PREFIX');
  SwaggerModule.setup(`${prefix}/docs`, app, buildOpenApiDocument(app), {
    customSiteTitle: 'Alfred API documentation',
    jsonDocumentUrl: `${prefix}/docs-json`,
    swaggerOptions: {
      persistAuthorization: false,
    },
  });
}
