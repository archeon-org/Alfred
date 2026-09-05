import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getFeatureFlags } from '@/services/feature-flags/feature-flags.service';
import { DISABLED_FEATURE_FLAGS } from '@/services/feature-flags/feature-flags';

export type FeatureFlagsQueryStatus = 'error' | 'loading' | 'ready';

export function useFeatureFlagsQuery() {
  const { data, isError, isPending, refetch } = useQuery({
    queryFn: getFeatureFlags,
    queryKey: ['feature-flags'],
    retry: false,
    staleTime: 60_000,
  });
  const reload = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);
  const status: FeatureFlagsQueryStatus = isPending ? 'loading' : isError ? 'error' : 'ready';

  return Object.freeze({ flags: data ?? DISABLED_FEATURE_FLAGS, reload, status });
}
