import type { SessionData } from '@alfred/contracts';

const REFRESH_LOCK_NAME = 'alfred.auth.refresh-session.v1';

let inFlightRefresh: Promise<SessionData | null> | null = null;

async function runWithBrowserLock(
  operation: () => Promise<SessionData | null>,
): Promise<SessionData | null> {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) {
    return operation();
  }

  return await navigator.locks.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, operation);
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
