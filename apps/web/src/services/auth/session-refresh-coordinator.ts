import type { SessionData } from '@alfred/contracts';
import { createSessionTimeout } from '@/services/auth/session-timeout';

const REFRESH_LOCK_NAME = 'alfred.auth.refresh-session.v1';

let inFlightRefresh: Promise<SessionData | null> | null = null;

async function runWithBrowserLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) {
    return operation();
  }

  const timeout = createSessionTimeout();
  try {
    return await navigator.locks.request(
      REFRESH_LOCK_NAME,
      { mode: 'exclusive', signal: timeout.signal },
      () => {
        // The lock signal only bounds acquisition; the auth request owns its network deadline.
        timeout.cancel();
        return operation();
      },
    );
  } finally {
    timeout.cancel();
  }
}

export function coordinateSessionLogout(operation: () => Promise<void>): Promise<void> {
  return runWithBrowserLock(operation);
}

export function coordinateSessionRefresh(
  operation: () => Promise<SessionData | null>,
): Promise<SessionData | null> {
  if (inFlightRefresh !== null) return inFlightRefresh;

  const request = runWithBrowserLock(operation);
  inFlightRefresh = request;
  const clearRequest = () => {
    if (inFlightRefresh === request) inFlightRefresh = null;
  };
  void request.then(clearRequest, clearRequest);
  return request;
}
