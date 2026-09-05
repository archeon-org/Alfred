import { createContext } from 'react';

import type { SessionData, SessionUser } from './auth-api';

export type SessionStatus = 'anonymous' | 'authenticated' | 'error' | 'loading';

export interface SessionContextValue {
  readonly accessToken: string | null;
  readonly logout: () => Promise<void>;
  readonly refresh: () => Promise<SessionData | null>;
  readonly status: SessionStatus;
  readonly user: SessionUser | null;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
