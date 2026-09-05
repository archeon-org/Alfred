import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../src/modules/auth/auth.service';
import type { GoogleOidcService } from '../../src/modules/auth/services/google-oidc.service';
import type { OauthStateService } from '../../src/modules/auth/services/oauth-state.service';
import type { RefreshSessionService } from '../../src/modules/auth/services/refresh-session.service';
import type { UserEntity } from '../../src/modules/users/user.entity';
import type { UsersService } from '../../src/modules/users/users.service';

const user = {
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
  updatedAt: new Date(),
} satisfies UserEntity;

function dependencies() {
  const google = {
    createAuthorizationUrl: vi.fn().mockReturnValue('https://accounts.google.test/authorize'),
    createChallenge: vi.fn().mockResolvedValue({
      codeChallenge: 'challenge',
      codeVerifier: 'verifier',
      nonce: 'nonce',
    }),
    exchangeCode: vi.fn().mockResolvedValue({
      avatarUrl: null,
      displayName: user.displayName,
      email: user.email,
      issuer: 'https://accounts.google.com',
      provider: 'google',
      subject: 'google-subject',
    }),
  };
  const oauthStates = {
    consume: vi.fn().mockResolvedValue({
      codeVerifier: 'verifier',
      nonce: 'nonce',
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
    google as unknown as GoogleOidcService,
    oauthStates as unknown as OauthStateService,
    sessions as unknown as RefreshSessionService,
    users as unknown as UsersService,
    config as unknown as ConfigService,
  );

  return { config, google, oauthStates, service, sessions, users };
}

describe('AuthService', () => {
  it('binds PKCE and nonce material to a one-time state before redirecting', async () => {
    const { google, oauthStates, service } = dependencies();

    await expect(service.startGoogleLogin('/app/team')).resolves.toEqual({
      state: 'oauth-state',
      url: 'https://accounts.google.test/authorize',
    });
    expect(oauthStates.create).toHaveBeenCalledWith({
      codeVerifier: 'verifier',
      nonce: 'nonce',
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
      service.completeGoogleLogin('authorization-code', 'query-state', 'cookie-state'),
    ).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      returnTo: '/app/team',
    });
    expect(oauthStates.consume).toHaveBeenCalledWith('query-state', 'cookie-state');
    expect(google.exchangeCode).toHaveBeenCalledWith('authorization-code', 'verifier', 'nonce');
    expect(users.upsertVerifiedIdentity).toHaveBeenCalledOnce();
    expect(sessions.create).toHaveBeenCalledWith(user);
  });

  it('consumes provider-declared failures without exchanging a code or creating a session', async () => {
    const { google, oauthStates, service, sessions, users } = dependencies();

    await expect(service.completeGoogleLoginError('query-state', 'cookie-state')).resolves.toBe(
      '/app/team',
    );
    expect(oauthStates.consume).toHaveBeenCalledWith('query-state', 'cookie-state');
    expect(google.exchangeCode).not.toHaveBeenCalled();
    expect(users.upsertVerifiedIdentity).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
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
