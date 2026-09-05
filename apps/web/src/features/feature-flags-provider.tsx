import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, type PropsWithChildren } from 'react';
import { getFeatureFlags } from './feature-flags-api';
import {
  FeatureFlagsContext,
  type FeatureFlagsContextValue,
  type FeatureFlagsStatus,
} from './feature-flags-context';
import { DISABLED_FEATURE_FLAGS } from './feature-flags';

export function FeatureFlagsProvider({ children }: PropsWithChildren) {
  const { data, isError, isPending, refetch } = useQuery({
    queryFn: getFeatureFlags,
    queryKey: ['feature-flags'],
    retry: false,
    staleTime: 60_000,
  });
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const status: FeatureFlagsStatus = isPending ? 'loading' : isError ? 'error' : 'ready';
  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ flags: data ?? DISABLED_FEATURE_FLAGS, reload, status }),
    [data, reload, status],
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}
