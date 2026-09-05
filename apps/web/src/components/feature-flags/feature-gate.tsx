import type { ReactNode } from 'react';
import { useFeatureFlagsQuery } from '@/hooks/feature-flags/use-feature-flags-query';
import type { FeatureFlagName } from '@/services/feature-flags/feature-flags';

interface FeatureGateProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly feature: FeatureFlagName;
}

export function FeatureGate({ children, fallback = null, feature }: FeatureGateProps) {
  const { flags, status } = useFeatureFlagsQuery();
  return status === 'ready' && flags[feature] ? children : fallback;
}
