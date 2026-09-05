import type { UserRole } from '@alfred/contracts';

export type { UserRole } from '@alfred/contracts';

export interface AuthPrincipal {
  readonly email: string;
  readonly id: string;
  readonly role: UserRole;
  readonly sessionId: string;
}

export interface AccessTokenPayload {
  readonly email: string;
  readonly role: UserRole;
  readonly sid: string;
  readonly sub: string;
  readonly typ: 'access';
}
