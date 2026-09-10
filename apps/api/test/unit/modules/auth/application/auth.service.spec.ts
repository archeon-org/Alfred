import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@api/modules/auth/application/auth.service';
import type { IdentityProviderRegistry } from '@api/modules/auth/application/identity-provider.registry';
import type { UserEntity } from '@api/modules/users/user.entity';
import type { UsersService } from '@api/modules/users/users.service';

const user = {
  workspaceMemberships: [],
  avatarUrl: null,
  createdAt: new Date(),
  displayName: 'Alfred User',
  email: 'person@example.test',
  id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
  identities: [],
  lastLoginAt: new Date(),
  refreshSessions: [],
  role: 'user',
  status: 'active',
  tenant: {
    createdAt: new Date(),
    id: '7c1d4d6e-2c3a-4d5e-8f90-1a2b3c4d5e6f',
    name: 'Default tenant',
    slug: 'default',
    status: 'active',
    updatedAt: new Date(),
  },
  tenantId: '7c1d4d6e-2c3a-4d5e-8f90-1a2b3c4d5e6f',
  updatedAt: new Date(),
} satisfies UserEntity;

function dependencies() {
  const google = {
    displayName: 'Google',
    isEnabled: vi.fn().mockReturnValue(true),
    key: 'google',
    createAuthorizationUrl: vi.fn().mockReturnValue('https://accounts.google.test/authorize'),
    createChallenge: vi.fn().mockResolvedValue({
      codeChallenge: 'challenge',
      codeVerifier: 'verifier',
      nonce: 'nonce',
    }),
    verifyCallback: vi.fn().mockResolvedValue({
      avatarUrl: null,
      displayName: user.displayName,
      email: user.email,
      issuer: 'https://accounts.google.com',
      provider: 'google',
      subject: 'google-subject',
    }),
  };
  const providers = {
    listEnabled: vi.fn().mockReturnValue([{ displayName: 'Google', id: 'google' }]),
    requireEnabled: vi.fn().mockReturnValue(google),
  };
  const oauthStates = {
    consume: vi.fn().mockResolvedValue({
      providerContext: { codeVerifier: 'verifier', nonce: 'nonce' },
      providerKey: 'google',
      returnTo: '/app/team',
    }),
    create: vi.fn().mockResolvedValue('oauth-state'),
  };
  const sessions = {
    create: vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user,
    }),
    revoke: vi.fn().mockResolvedValue(undefined),
    rotate: vi.fn().mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      user,
    }),
  };
  const users = { upsertVerifiedIdentity: vi.fn().mockResolvedValue(user) };
  const config = {
    getOrThrow: vi.fn().mockReturnValue('https://alfred.example.test'),
  };
  const service = new AuthService(
    providers as unknown as IdentityProviderRegistry,
    oauthStates,
    sessions,
    users as unknown as UsersService,
    config as unknown as ConfigService,
  );

  return { config, google, oauthStates, providers, service, sessions, users };
}

describe('AuthService', () => {
  it('binds PKCE and nonce material to a one-time state before redirecting', async () => {
    const { google, oauthStates, service } = dependencies();

    await expect(service.startLogin('google', '/app/team')).resolves.toEqual({
      state: 'oauth-state',
      url: 'https://accounts.google.test/authorize',
    });
    expect(oauthStates.create).toHaveBeenCalledWith({
      providerContext: { codeChallenge: 'challenge', codeVerifier: 'verifier', nonce: 'nonce' },
      providerKey: 'google',
      returnTo: '/app/team',
    });
    expect(google.createAuthorizationUrl).toHaveBeenCalledWith(
      'oauth-state',
      expect.objectContaining({ codeChallenge: 'challenge' }),
    );
  });

  it('creates an Alfred session only after state and Google identity validation', async () => {
    const { google, oauthStates, service, sessions, users } = dependencies();

    await expect(
      service.completeLogin('google', 'authorization-code', 'query-state', 'cookie-state'),
    ).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      returnTo: '/app/team',
    });
    expect(oauthStates.consume).toHaveBeenCalledWith('google', 'query-state', 'cookie-state');
    expect(google.verifyCallback).toHaveBeenCalledWith('authorization-code', {
      codeVerifier: 'verifier',
      nonce: 'nonce',
    });
    expect(users.upsertVerifiedIdentity).toHaveBeenCalledOnce();
    expect(sessions.create).toHaveBeenCalledWith(user);
  });

  it('consumes provider-declared failures without exchanging a code or creating a session', async () => {
    const { google, oauthStates, service, sessions, users } = dependencies();

    await expect(service.completeLoginError('google', 'query-state', 'cookie-state')).resolves.toBe(
      '/app/team',
    );
    expect(oauthStates.consume).toHaveBeenCalledWith('google', 'query-state', 'cookie-state');
    expect(google.verifyCallback).not.toHaveBeenCalled();
    expect(users.upsertVerifiedIdentity).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('publishes only enabled provider descriptors', () => {
    const { providers, service } = dependencies();

    expect(service.listProviders()).toEqual([{ displayName: 'Google', id: 'google' }]);
    expect(providers.listEnabled).toHaveBeenCalledOnce();
  });

  it('delegates refresh and logout to the persistent session boundary', async () => {
    const { service, sessions } = dependencies();

    await expect(service.refresh('refresh-token')).resolves.toMatchObject({
      accessToken: 'rotated-access-token',
    });
    await expect(service.logout('refresh-token')).resolves.toBeUndefined();
    expect(sessions.rotate).toHaveBeenCalledWith('refresh-token');
    expect(sessions.revoke).toHaveBeenCalledWith('refresh-token');
  });

  it('builds a fixed-origin frontend callback URL with a relative return path', () => {
    const { service } = dependencies();

    expect(service.createFrontendCallbackUrl('/app/team')).toBe(
      'https://alfred.example.test/auth/callback?returnTo=%2Fapp%2Fteam',
    );
    expect(service.createFrontendCallbackErrorUrl('access_denied', '/app/team')).toBe(
      'https://alfred.example.test/auth/callback?error=access_denied&returnTo=%2Fapp%2Fteam',
    );
  });
});
