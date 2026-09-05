import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApplication } from '../../src/bootstrap';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';
import { IpThrottlerGuard } from '../../src/common/guards/alfred-throttler.guard';
import { validateEnv } from '../../src/config/configuration';
import { DatabaseHealthIndicator } from '../../src/modules/health/database-health.indicator';
import { HealthController } from '../../src/modules/health/health.controller';
import { HealthService } from '../../src/modules/health/health.service';
import { RedisHealthIndicator } from '../../src/modules/health/redis-health.indicator';
import { MetricsService } from '../../src/observability/metrics.service';
import { ObservabilityModule } from '../../src/observability/observability.module';

describe('operational health module', () => {
  let app: INestApplication;
  let baseUrl: string;
  let metrics: MetricsService;
  const query = vi.fn();
  const checkRedis = vi.fn();
  const throttleIncrement = vi.fn();

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_HOST', '127.0.0.1');
    vi.stubEnv('API_PORT', '3000');
    vi.stubEnv('API_PREFIX', 'api');
    vi.stubEnv('API_CORS_ORIGINS', 'http://localhost:5173');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    vi.stubEnv('AUTH_JWT_SECRET', 'test-only-signing-secret-that-is-longer-than-32-characters');
    vi.stubEnv('AUTH_SESSION_RETENTION_SECONDS', '2592000');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://alfred:test-password@localhost:5432/alfred_test?schema=public',
    );
    vi.stubEnv('FEATURE_GOOGLE_OAUTH_ENABLED', 'false');
    vi.stubEnv('OBSERVABILITY_METRICS_ENABLED', 'true');
    vi.stubEnv(
      'OBSERVABILITY_METRICS_TOKEN',
      'test-only-metrics-secret-that-is-longer-than-32-characters',
    );
    vi.stubEnv('WEB_APP_URL', 'http://localhost:5173');

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        ObservabilityModule,
        ThrottlerModule.forRoot({
          storage: { increment: throttleIncrement } as unknown as ThrottlerStorage,
          throttlers: [{ limit: 120, name: 'ip', ttl: 60_000 }],
        }),
      ],
      controllers: [HealthController],
      providers: [
        DatabaseHealthIndicator,
        HealthService,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: IpThrottlerGuard },
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
    metrics = moduleRef.get(MetricsService);
  });

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([{ result: 1 }]);
    checkRedis.mockReset();
    checkRedis.mockResolvedValue({ redis: { status: 'up' } });
    throttleIncrement.mockReset();
    throttleIncrement.mockRejectedValue(new Error('throttling storage unavailable'));
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('resolves liveness without querying PostgreSQL', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const response = await fetch(`${baseUrl}/health/live`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    const body: unknown = await response.json();
    const completionRecords = write.mock.calls
      .map(([value]) => String(value))
      .filter((value) => value.includes('"event":"http_request_completed"'))
      .map((value) => JSON.parse(value) as Record<string, unknown>);
    write.mockRestore();

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(body).toMatchObject({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
    expect(throttleIncrement).not.toHaveBeenCalled();
    expect(completionRecords).toHaveLength(1);
    expect(completionRecords[0]).toMatchObject({ route: '/health/live', statusCode: 200 });
    await expect(metrics.render()).resolves.toContain(
      'alfred_api_http_requests_total{method="GET",route="/health/live",status_code="200"} 1',
    );
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
    expect(throttleIncrement).not.toHaveBeenCalled();
  });

  it('marks readiness down when PostgreSQL is unavailable without leaking its error', async () => {
    query.mockRejectedValueOnce(new Error('password authentication failed for secret-user'));
    const response = await fetch(`${baseUrl}/health/ready`);
    const body: unknown = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: 'HTTP_503',
        details: { database: { status: 'down' }, redis: { status: 'up' } },
      },
      success: false,
    });
    expect(JSON.stringify(body)).not.toContain('secret-user');
    expect(throttleIncrement).not.toHaveBeenCalled();
  });

  it('keeps readiness dependency-aware while bypassing the rate-limit store', async () => {
    checkRedis.mockResolvedValueOnce({ redis: { status: 'down' } });

    const response = await fetch(`${baseUrl}/health/ready`);
    const body: unknown = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: 'HTTP_503',
        details: { database: { status: 'up' }, redis: { status: 'down' } },
      },
      success: false,
    });
    expect(checkRedis).toHaveBeenCalledOnce();
    expect(throttleIncrement).not.toHaveBeenCalled();
  });
});
