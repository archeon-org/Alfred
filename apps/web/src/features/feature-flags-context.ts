import { createContext } from 'react';
import type { FeatureFlags } from './feature-flags';

export type FeatureFlagsStatus = 'error' | 'loading' | 'ready';

export interface FeatureFlagsContextValue {
  readonly flags: FeatureFlags;
  readonly reload: () => Promise<void>;
  readonly status: FeatureFlagsStatus;
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);
