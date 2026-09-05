import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { logoutSession, refreshSession, type SessionData } from './auth-api';
import { SessionContext, type SessionContextValue } from './session-context';

type SessionState = Pick<SessionContextValue, 'accessToken' | 'status' | 'user'>;

const anonymousSession: SessionState = Object.freeze({
  accessToken: null,
  status: 'anonymous',
  user: null,
});

const loadingSession: SessionState = Object.freeze({
  accessToken: null,
  status: 'loading',
  user: null,
});

function authenticatedSession(session: SessionData): SessionState {
  return Object.freeze({
    accessToken: session.accessToken,
    status: 'authenticated',
    user: session.user,
  });
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionState>(loadingSession);
  const mounted = useRef(false);
  const revision = useRef(0);
  const inFlightRefresh = useRef<Promise<SessionData | null> | null>(null);

  const performRefresh = useCallback(async () => {
    const requestRevision = revision.current + 1;
    revision.current = requestRevision;

    try {
      const refreshed = await refreshSession();
      if (mounted.current && revision.current === requestRevision) {
        setSession(refreshed === null ? anonymousSession : authenticatedSession(refreshed));
      }
      return refreshed;
    } catch {
      if (mounted.current && revision.current === requestRevision) {
        setSession(anonymousSession);
      }
      return null;
    }
  }, []);

  const refresh = useCallback(() => {
    if (inFlightRefresh.current !== null) {
      return inFlightRefresh.current;
    }

    const request = performRefresh();
    inFlightRefresh.current = request;
    void request.finally(() => {
      if (inFlightRefresh.current === request) {
        inFlightRefresh.current = null;
      }
    });
    return request;
  }, [performRefresh]);

  const logout = useCallback(async () => {
    const requestRevision = revision.current + 1;
    revision.current = requestRevision;

    await logoutSession();
    if (mounted.current && revision.current === requestRevision) {
      setSession(anonymousSession);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ ...session, logout, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}
