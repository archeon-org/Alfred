import { featureFlagsSchema, successEnvelopeSchema } from '@alfred/contracts';
import { buildApiUrl } from '../lib/api-url';
import type { FeatureFlags } from './feature-flags';

const featureFlagsEnvelopeSchema = successEnvelopeSchema(featureFlagsSchema);

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const response = await fetch(buildApiUrl('/features'), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    method: 'GET',
  });
  if (!response.ok) throw new Error('The feature flag service is unavailable.');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The server feature flags are invalid.');
  }
  const parsed = featureFlagsEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('The server feature flags are invalid.');
  }
  return parsed.data.data;
}
