import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { HealthController } from '../../src/modules/health/health.controller';
import { PrismaService } from '../../src/modules/prisma/prisma.service';

describe('operational health module', () => {
  let app: INestApplication;
  let controller: HealthController;
  const queryRaw = vi.fn();

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_HOST', '127.0.0.1');
    vi.stubEnv('API_PORT', '3000');
    vi.stubEnv('API_PREFIX', 'api');
    vi.stubEnv('API_CORS_ORIGINS', 'http://localhost:5173');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://alfred:test-password@localhost:5432/alfred_test?schema=public',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw })
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    controller = moduleRef.get(HealthController);
  });

  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ result: 1 }]);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('resolves liveness without querying PostgreSQL', async () => {
    await expect(controller.checkLiveness()).resolves.toMatchObject({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('resolves readiness only after querying PostgreSQL', async () => {
    await expect(controller.checkReadiness()).resolves.toMatchObject({
      details: { database: { status: 'up' } },
      status: 'ok',
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('marks readiness down when PostgreSQL is unavailable without leaking its error', async () => {
    queryRaw.mockRejectedValueOnce(new Error('password authentication failed for secret-user'));

    let thrown: unknown;
    try {
      await controller.checkReadiness();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      response: {
        details: { database: { status: 'down' } },
        status: 'error',
      },
    });
    expect(JSON.stringify(thrown)).not.toContain('secret-user');
  });
});
