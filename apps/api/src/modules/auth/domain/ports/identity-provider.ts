import type { VerifiedIdentity } from '../../../users/users.service';

export type IdentityProviderContext = Readonly<Record<string, string>>;

export interface IdentityProviderDescriptor {
  readonly displayName: string;
  readonly id: string;
}

export interface IdentityProvider {
  readonly displayName: string;
  readonly key: string;

  isEnabled(): boolean;
  createChallenge(): Promise<IdentityProviderContext>;
  createAuthorizationUrl(state: string, context: IdentityProviderContext): string;
  verifyCallback(credential: string, context: IdentityProviderContext): Promise<VerifiedIdentity>;
}

export const IDENTITY_PROVIDERS = Symbol('IDENTITY_PROVIDERS');
