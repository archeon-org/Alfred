import type { INestApplication } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { FeatureFlagName } from '@api/modules/feature-flags/feature-flags.types';
import { runFeatureState } from './feature-flag-state';

type FeatureCase = (app: INestApplication) => void | Promise<void>;
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Register at collection time. Cases run assertions; they must not register tests or hooks. */
export function describeFeatureBothStates(
  flag: FeatureFlagName,
  buildApp: () => Promise<INestApplication>,
  cases: Readonly<{ whenEnabled: FeatureCase; whenDisabled: FeatureCase }>,
): void {
  describe.sequential(`${flag}: both feature states`, () => {
    for (const enabled of [true, false]) {
      it(enabled ? 'flag ON' : 'flag OFF', async () => {
        await runFeatureState(
          flag,
          enabled,
          buildApp,
          enabled ? cases.whenEnabled : cases.whenDisabled,
        );
      });
    }
  });
}

export async function expectFeatureRouteHidden(
  app: INestApplication,
  method: HttpMethod,
  path: string,
): Promise<void> {
  const response = await fetch(`${await app.getUrl()}${path}`, { method, redirect: 'manual' });
  expect(response.status, `${method} ${path}`).toBe(404);
  expect(await response.json()).toMatchObject({
    success: false,
    error: { code: 'HTTP_404' },
  });
}
