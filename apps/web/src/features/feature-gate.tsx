import type { ReactNode } from 'react';
import type { FeatureFlagName } from './feature-flags';
import { useFeatureFlags } from './use-feature-flags';

interface FeatureGateProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly feature: FeatureFlagName;
}

export function FeatureGate({ children, fallback = null, feature }: FeatureGateProps) {
  const { flags, status } = useFeatureFlags();
  return status === 'ready' && flags[feature] ? children : fallback;
}
