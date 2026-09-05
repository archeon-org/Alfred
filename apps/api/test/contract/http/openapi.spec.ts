import type { AddressInfo } from 'node:net';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { configureOpenApi, isOpenApiEnabled } from '@api/common/openapi';
import { validateEnv } from '@api/config/configuration';

@ApiBearerAuth('bearerAuth')
@Controller('openapi-probe')
class OpenApiProbeController {
  @Get()
  getProbe(): { status: string } {
    return { status: 'ok' };
  }
}

describe('OpenAPI HTTP documentation', () => {
  let app: INestApplication;
  let baseUrl: string;

  const sensitiveValues = [
    'openapi-test-jwt-secret-never-publish-123456789',
    'openapi-test-database-password-never-publish',
    'openapi-test-google-secret-never-publish',
    'openapi-test-metrics-token-never-publish-123456789',
  ] as const;

  it('keeps the documentation disabled in production', () => {
    expect(isOpenApiEnabled(new ConfigService({ NODE_ENV: 'production' }))).toBe(false);
    expect(isOpenApiEnabled(new ConfigService({ NODE_ENV: 'development' }))).toBe(true);
  });

  beforeAll(async () => {
    vi.stubEnv('AUTH_JWT_SECRET', sensitiveValues[0]);
    vi.stubEnv(
      'DATABASE_URL',
      `postgresql://alfred:${sensitiveValues[1]}@localhost:5432/alfred_test?schema=public`,
    );
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', sensitiveValues[2]);
    vi.stubEnv('OBSERVABILITY_METRICS_TOKEN', sensitiveValues[3]);

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
      controllers: [OpenApiProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    configureOpenApi(app);
    await app.listen(0, '127.0.0.1');

    const server = app.getHttpServer() as { address(): AddressInfo | null | string };
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('HTTP test server failed');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('serves Swagger UI at the requested API path', async () => {
    const response = await fetch(`${baseUrl}/api/docs`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('id="swagger-ui"');
  });

  it('publishes a prefixed OpenAPI document with an available bearer scheme and no secrets', async () => {
    const response = await fetch(`${baseUrl}/api/docs-json`);
    const document: unknown = await response.json();
    const serializedDocument = JSON.stringify(document);

    expect(response.status).toBe(200);
    expect(document).toMatchObject({
      components: {
        securitySchemes: {
          bearerAuth: {
            bearerFormat: 'JWT',
            scheme: 'bearer',
            type: 'http',
          },
        },
      },
      info: {
        title: 'Alfred API',
        version: '0.1.0',
      },
      openapi: '3.0.0',
      paths: {
        '/api/openapi-probe': {},
      },
    });
    expect(document).not.toHaveProperty('security');
    expect(document).toHaveProperty(['paths', '/api/openapi-probe', 'get']);
    expect(document).toHaveProperty(
      ['paths', '/api/openapi-probe', 'get', 'security'],
      [{ bearerAuth: [] }],
    );

    for (const sensitiveValue of sensitiveValues) {
      expect(serializedDocument).not.toContain(sensitiveValue);
    }
  });
});
