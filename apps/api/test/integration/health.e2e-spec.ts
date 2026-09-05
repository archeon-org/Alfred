import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApplication } from '../../src/bootstrap';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';
import { validateEnv } from '../../src/config/configuration';
import { DatabaseHealthIndicator } from '../../src/modules/health/database-health.indicator';
import { HealthController } from '../../src/modules/health/health.controller';
import { HealthService } from '../../src/modules/health/health.service';
import { RedisHealthIndicator } from '../../src/modules/health/redis-health.indicator';

describe('operational health module', () => {
  let app: INestApplication;
  let baseUrl: string;
  const query = vi.fn();
  const checkRedis = vi.fn();

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_HOST', '127.0.0.1');
    vi.stubEnv('API_PORT', '3000');
    vi.stubEnv('API_PREFIX', 'api');
    vi.stubEnv('API_CORS_ORIGINS', 'http://localhost:5173');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    vi.stubEnv('AUTH_JWT_SECRET', 'test-only-signing-secret-that-is-longer-than-32-characters');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://alfred:test-password@localhost:5432/alfred_test?schema=public',
    );
    vi.stubEnv('FEATURE_GOOGLE_OAUTH_ENABLED', 'false');
    vi.stubEnv('WEB_APP_URL', 'http://localhost:5173');

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
      controllers: [HealthController],
      providers: [
        DatabaseHealthIndicator,
        HealthService,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: DataSource, useValue: { query } },
        { provide: RedisHealthIndicator, useValue: { check: checkRedis } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo | null | string };
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('HTTP test server failed');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([{ result: 1 }]);
    checkRedis.mockReset();
    checkRedis.mockResolvedValue({ redis: { status: 'up' } });
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('resolves liveness without querying PostgreSQL', async () => {
    const response = await fetch(`${baseUrl}/health/live`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(body).toMatchObject({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('resolves readiness only after querying PostgreSQL', async () => {
    const response = await fetch(`${baseUrl}/health/ready`);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      details: { database: { status: 'up' }, redis: { status: 'up' } },
      status: 'ok',
    });
    expect(query).toHaveBeenCalledOnce();
    expect(checkRedis).toHaveBeenCalledOnce();
  });

  it('marks readiness down when PostgreSQL is unavailable without leaking its error', async () => {
    query.mockRejectedValueOnce(new Error('password authentication failed for secret-user'));
    const response = await fetch(`${baseUrl}/health/ready`);
    const body: unknown = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: { code: 'HTTP_503' },
      success: false,
    });
    expect(JSON.stringify(body)).not.toContain('secret-user');
  });
});
