import { useMemo } from 'react';
import { useSession } from '@/hooks/auth/use-session';
import { createHttpClient } from '@/services/http/http-client';

export function useApiClient() {
  const { accessToken, refresh } = useSession();

  return useMemo(
    () => createHttpClient({ getAccessToken: () => accessToken, refresh }),
    [accessToken, refresh],
  );
}
