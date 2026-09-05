import type { Request } from 'express';
import type { AuthPrincipal } from './auth-principal';

export interface AuthenticatedRequest extends Request {
  user: AuthPrincipal;
}

export interface RequestWithCookies extends Request {
  cookies: Readonly<Record<string, string | undefined>>;
}
