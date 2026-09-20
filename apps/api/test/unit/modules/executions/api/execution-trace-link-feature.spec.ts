import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { expect, vi } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { parseEnvironment } from '@api/config/environment';
import { ExecutionResourceController } from '@api/modules/executions/api/execution-resource.controller';
import { ExecutionSessionGuard } from '@api/modules/executions/api/execution-session.guard';
import { ExecutionObservationService } from '@api/modules/executions/application/execution-observation.service';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { TraceLinkService } from '@api/modules/executions/application/trace-link.service';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '@api/modules/feature-flags/feature-flags.controller';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { StreamAuthorityService } from '@api/modules/stream/application/stream-authority.service';
import {
  describeFeatureBothStates,
  expectFeatureRouteHidden,
} from '../../../../support/feature-flags';

const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const TRACE_URL =
  'https://smith.langchain.com/o/org/projects/p/proj/r/33333333-3333-4333-8333-333333333333?poll=true';

/** Focused HTTP module: the real flag guard and filter, the services stubbed. */
async function buildApp(): Promise<INestApplication> {
  const config = new ConfigService(
    parseEnvironment({
      AUTH_JWT_SECRET: 'synthetic-test-signing-secret-at-least-32-characters',
      DATABASE_URL: 'postgresql://test:unused@localhost/unused',
      FEATURE_AGENT_RUNTIME_ENABLED: 'true',
      FEATURE_TRACE_LINKS_ENABLED: process.env.FEATURE_TRACE_LINKS_ENABLED,
      TRACE_LINK_UI_URL: 'https://smith.langchain.com',
      TRACE_LINK_ORGANIZATION_ID: 'org',
      TRACE_LINK_PROJECT_ID: 'proj',
      EXECUTION_CURSOR_KEY: 'cursor-feature-fixture-key-123456789012345',
      NODE_ENV: 'test',
    }),
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [ExecutionResourceController, FeatureFlagsController],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: FeatureFlagGuard },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: ExecutionsService, useValue: { stop: vi.fn() } },
      { provide: ExecutionObservationService, useValue: { snapshot: vi.fn() } },
      { provide: StreamAuthorityService, useValue: { assert: vi.fn().mockResolvedValue(0) } },
      {
        provide: TraceLinkService,
        useValue: { linkFor: vi.fn().mockResolvedValue({ url: TRACE_URL }) },
      },
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

describeFeatureBothStates('traceLinks', buildApp, {
  whenEnabled: async (app) => {
    const response = await fetch(`${await app.getUrl()}/api/executions/${EXECUTION_ID}/trace-link`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { url: TRACE_URL } });
    expect(
      app.get<{ linkFor: ReturnType<typeof vi.fn> }>(TraceLinkService).linkFor,
    ).toHaveBeenCalledOnce();
  },
  whenDisabled: async (app) => {
    await expectFeatureRouteHidden(app, 'GET', `/api/executions/${EXECUTION_ID}/trace-link`);
    // The sibling resource routes stay served by the agent runtime capability alone.
    const response = await fetch(`${await app.getUrl()}/api/executions/${EXECUTION_ID}`);
    expect(response.status).toBe(200);
  },
});
