import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { expect, vi } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { parseEnvironment } from '@api/config/environment';
import { AgentsController } from '@api/modules/agents/api/agents.controller';
import { AgentCatalogService } from '@api/modules/agents/application/agent-catalog.service';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '@api/modules/feature-flags/feature-flags.controller';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import {
  describeFeatureBothStates,
  expectFeatureRouteHidden,
} from '../../../../support/feature-flags';

const CATALOG = {
  items: [
    {
      id: '98480af1-6fd5-51b1-9b43-97834987e6ea',
      graphId: 'topology',
      name: 'topology',
      shortDescription: 'AI-Ops infrastructure topology explorer.',
      description: null,
      tags: ['topology'],
    },
  ],
};

/** Focused HTTP module: the real flag guard and filter, the catalog service stubbed. */
async function buildApp(): Promise<INestApplication> {
  const config = new ConfigService(
    parseEnvironment({
      AUTH_JWT_SECRET: 'synthetic-test-signing-secret-at-least-32-characters',
      DATABASE_URL: 'postgresql://test:unused@localhost/unused',
      FEATURE_TEAMS_ENABLED: process.env.FEATURE_TEAMS_ENABLED,
      NODE_ENV: 'test',
    }),
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [AgentsController, FeatureFlagsController],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: FeatureFlagGuard },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: AgentCatalogService, useValue: { list: vi.fn().mockResolvedValue(CATALOG) } },
      FeatureFlagsService,
    ],
  }).compile();
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

describeFeatureBothStates('teams', buildApp, {
  whenEnabled: async (app) => {
    const response = await fetch(`${await app.getUrl()}/api/agents`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: CATALOG });
  },
  whenDisabled: async (app) => {
    await expectFeatureRouteHidden(app, 'GET', '/api/agents');
    expect(
      app.get<{ list: ReturnType<typeof vi.fn> }>(AgentCatalogService).list,
    ).not.toHaveBeenCalled();
  },
});
