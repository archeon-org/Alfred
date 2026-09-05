import { useMemo } from 'react';
import { createAuthenticatedApiClient } from './authenticated-api-client';
import { useSession } from './use-session';

export function useAuthenticatedApiClient() {
  const { accessToken, refresh } = useSession();

  return useMemo(
    () => createAuthenticatedApiClient({ getAccessToken: () => accessToken, refresh }),
    [accessToken, refresh],
  );
}
