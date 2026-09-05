import type { PublicUser } from '@alfred/contracts';

export interface SessionSubject {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly role: PublicUser['role'];
}

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: PublicUser;
}

export interface SessionPort {
  create(user: SessionSubject): Promise<IssuedSession>;
  rotate(rawToken: string): Promise<IssuedSession>;
  revoke(rawToken: string | undefined): Promise<void>;
}

export const SESSION_PORT = Symbol('SESSION_PORT');
