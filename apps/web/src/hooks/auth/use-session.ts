import { useContext } from 'react';

import { SessionContext } from '@/contexts/session/session-context';

export function useSession() {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession doit être utilisé dans SessionProvider.');
  }

  return session;
}
