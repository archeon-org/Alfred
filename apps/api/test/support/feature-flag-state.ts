import type { INestApplication } from '@nestjs/common';
import { featureFlagsSchema, successEnvelopeSchema } from '@alfred/contracts';
import { expect } from 'vitest';

import {
  FEATURE_FLAG_ENVIRONMENT_KEYS,
  type FeatureFlagName,
} from '@api/modules/feature-flags/feature-flags.types';

const manifestSchema = successEnvelopeSchema(featureFlagsSchema);

/** Internal lifecycle runner, separate from collection-time test registration. */
export async function runFeatureState(
  flag: FeatureFlagName,
  enabled: boolean,
  buildApp: () => Promise<INestApplication>,
  runCase: (app: INestApplication) => void | Promise<void>,
): Promise<void> {
  const key = FEATURE_FLAG_ENVIRONMENT_KEYS[flag];
  const previous = process.env[key];
  let app: INestApplication | undefined;
  try {
    process.env[key] = String(enabled);
    app = await buildApp();
    const response = await fetch(`${await app.getUrl()}/api/features`, { redirect: 'manual' });
    expect(response.status).toBe(200);
    const manifest = manifestSchema.parse(await response.json());
    expect(manifest.data[flag], `${flag} effective availability`).toBe(enabled);
    await runCase(app);
  } finally {
    try {
      await app?.close();
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
}
