import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getAuthProviders } from '@/services/auth/auth.service';

export type AuthProvidersQueryStatus = 'error' | 'loading' | 'ready';

export function useAuthProvidersQuery() {
  const { data, isError, isPending, refetch } = useQuery({
    queryFn: getAuthProviders,
    queryKey: ['auth-providers'],
    retry: false,
    staleTime: 60_000,
  });
  const reload = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);
  const status: AuthProvidersQueryStatus = isPending ? 'loading' : isError ? 'error' : 'ready';

  return Object.freeze({ providers: data ?? [], reload, status });
}
