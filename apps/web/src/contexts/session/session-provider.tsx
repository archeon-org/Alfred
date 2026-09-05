import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { SessionContext, type SessionContextValue } from '@/contexts/session/session-context';
import { logoutSession, refreshSession, type SessionData } from '@/services/auth/auth.service';
import {
  coordinateSessionLogout,
  coordinateSessionRefresh,
} from '@/services/auth/session-refresh-coordinator';

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

const unavailableSession: SessionState = Object.freeze({
  accessToken: null,
  status: 'error',
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
  const inFlightLogout = useRef<Promise<void> | null>(null);

  const performRefresh = useCallback(async () => {
    const requestRevision = revision.current + 1;
    revision.current = requestRevision;

    try {
      const refreshed = await coordinateSessionRefresh(refreshSession);
      if (!mounted.current || revision.current !== requestRevision) return null;
      setSession(refreshed === null ? anonymousSession : authenticatedSession(refreshed));
      return refreshed;
    } catch (error) {
      if (mounted.current && revision.current === requestRevision) {
        setSession(unavailableSession);
      }
      throw error;
    }
  }, []);

  const refresh = useCallback(() => {
    if (inFlightLogout.current !== null) return Promise.resolve(null);
    if (inFlightRefresh.current !== null) {
      return inFlightRefresh.current;
    }

    const request = performRefresh();
    inFlightRefresh.current = request;
    const clearRequest = () => {
      if (inFlightRefresh.current === request) {
        inFlightRefresh.current = null;
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  }, [performRefresh]);

  const performLogout = useCallback(async () => {
    const requestRevision = revision.current + 1;
    revision.current = requestRevision;

    // Let a rotating response settle before clearing the shared refresh cookie, even without Web Locks.
    await inFlightRefresh.current?.catch(() => undefined);
    await coordinateSessionLogout(logoutSession);
    if (mounted.current && revision.current === requestRevision) {
      setSession(anonymousSession);
    }
  }, []);

  const logout = useCallback(() => {
    if (inFlightLogout.current !== null) return inFlightLogout.current;
    const request = performLogout();
    inFlightLogout.current = request;
    const clearRequest = () => {
      if (inFlightLogout.current === request) inFlightLogout.current = null;
    };
    void request.then(clearRequest, clearRequest);
    return request;
  }, [performLogout]);

  useEffect(() => {
    mounted.current = true;
    void refresh().catch(() => undefined);

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
