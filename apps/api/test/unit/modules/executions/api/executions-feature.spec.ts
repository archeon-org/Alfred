import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { expect, vi } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { parseEnvironment } from '@api/config/environment';
import { ExecutionsController } from '@api/modules/executions/api/executions.controller';
import { ExecutionSessionGuard } from '@api/modules/executions/api/execution-session.guard';
import { ExecutionObservationService } from '@api/modules/executions/application/execution-observation.service';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '@api/modules/feature-flags/feature-flags.controller';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import {
  describeFeatureBothStates,
  expectFeatureRouteHidden,
} from '../../../../support/feature-flags';

const CONVERSATION_ID = '3f2e1d0c-9b8a-4765-8321-fedcba987654';

function createExecutionsService() {
  return {
    listMessages: vi.fn().mockResolvedValue([]),
    start: vi.fn(),
    active: vi.fn(),
  };
}

/** Focused HTTP module: the real flag guard and filter, the bridge service stubbed. */
async function buildApp(): Promise<INestApplication> {
  const config = new ConfigService(
    parseEnvironment({
      AUTH_JWT_SECRET: 'synthetic-test-signing-secret-at-least-32-characters',
      DATABASE_URL: 'postgresql://test:unused@localhost/unused',
      FEATURE_AGENT_RUNTIME_ENABLED: process.env.FEATURE_AGENT_RUNTIME_ENABLED,
      EXECUTION_CURSOR_KEY: 'cursor-feature-fixture-key-123456789012345',
      NODE_ENV: 'test',
    }),
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [ExecutionsController, FeatureFlagsController],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: FeatureFlagGuard },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: ExecutionsService, useValue: createExecutionsService() },
      { provide: ExecutionObservationService, useValue: { snapshot: vi.fn() } },
      FeatureFlagsService,
    ],
  })
    .overrideGuard(ExecutionSessionGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  try {
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

describeFeatureBothStates('agentRuntime', buildApp, {
  whenEnabled: async (app) => {
    const response = await fetch(
      `${await app.getUrl()}/api/conversations/${CONVERSATION_ID}/messages`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { items: [] } });
    expect(
      app.get<ReturnType<typeof createExecutionsService>>(ExecutionsService).listMessages,
    ).toHaveBeenCalledOnce();
  },
  whenDisabled: async (app) => {
    await expectFeatureRouteHidden(app, 'GET', `/api/conversations/${CONVERSATION_ID}/messages`);
    await expectFeatureRouteHidden(app, 'POST', `/api/conversations/${CONVERSATION_ID}/executions`);
    const service = app.get<ReturnType<typeof createExecutionsService>>(ExecutionsService);
    expect(service.listMessages).not.toHaveBeenCalled();
    expect(service.start).not.toHaveBeenCalled();
  },
});
