import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { expect, vi } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import {
  OauthCallbackThrottlerGuard,
  OauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '@api/common/guards/alfred-throttler.guard';
import { parseEnvironment } from '@api/config/environment';
import { AuthController } from '@api/modules/auth/api/auth.controller';
import { AuthCookieService } from '@api/modules/auth/api/cookies/auth-cookie.service';
import { AuthService } from '@api/modules/auth/application/auth.service';
import { IdentityProviderRegistry } from '@api/modules/auth/application/identity-provider.registry';
import { IDENTITY_PROVIDERS } from '@api/modules/auth/domain/ports/identity-provider';
import {
  OAUTH_STATE_PORT,
  type OauthStatePort,
} from '@api/modules/auth/domain/ports/oauth-state.port';
import { SESSION_PORT } from '@api/modules/auth/domain/ports/session.port';
import { GoogleOidcService } from '@api/modules/auth/infrastructure/identity/google-oidc.service';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '@api/modules/feature-flags/feature-flags.controller';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { UsersService } from '@api/modules/users/users.service';
import { describeFeatureBothStates, expectFeatureRouteHidden } from '../../support/feature-flags';

const state = 'synthetic-oauth-state-at-least-32-characters';
const callbackUrl = 'http://localhost:3000/api/auth/providers/google/callback';

function createStatePort() {
  return {
    create: vi.fn<OauthStatePort['create']>().mockResolvedValue(state),
    consume: vi.fn<OauthStatePort['consume']>(),
  };
}

async function buildApp(): Promise<INestApplication> {
  const config = new ConfigService(
    parseEnvironment({
      AUTH_JWT_SECRET: 'synthetic-test-signing-secret-at-least-32-characters',
      DATABASE_URL: 'postgresql://test:unused@localhost/unused',
      FEATURE_GOOGLE_OAUTH_ENABLED: process.env.FEATURE_GOOGLE_OAUTH_ENABLED,
      GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-client-secret',
      GOOGLE_OAUTH_CALLBACK_URL: callbackUrl,
      NODE_ENV: 'test',
    }),
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController, FeatureFlagsController],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: FeatureFlagGuard },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      AuthCookieService,
      AuthService,
      IdentityProviderRegistry,
      GoogleOidcService,
      FeatureFlagsService,
      {
        provide: IDENTITY_PROVIDERS,
        inject: [GoogleOidcService],
        useFactory: (google: GoogleOidcService) => Object.freeze([google]),
      },
      {
        provide: OAUTH_STATE_PORT,
        useValue: createStatePort(),
      },
      { provide: SESSION_PORT, useValue: { create: vi.fn(), rotate: vi.fn(), revoke: vi.fn() } },
      { provide: UsersService, useValue: { upsertVerifiedIdentity: vi.fn() } },
    ],
  })
    .overrideGuard(OauthStartThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(OauthCallbackThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(RefreshThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  try {
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

describeFeatureBothStates('googleOAuth', buildApp, {
  whenEnabled: async (app) => {
    const origin = await app.getUrl();
    const providers = await fetch(`${origin}/api/auth/providers`);
    expect(providers.status).toBe(200);
    expect(await providers.json()).toEqual({
      success: true,
      data: [{ id: 'google', displayName: 'Google' }],
    });
    const oauthStates = app.get<ReturnType<typeof createStatePort>>(OAUTH_STATE_PORT);
    for (const path of ['/api/auth/google/start', '/api/auth/providers/google/start']) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
      expect(response.status).toBe(302);
      const url = new URL(response.headers.get('location') ?? '');
      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('client_id')).toBe('synthetic-client.apps.googleusercontent.com');
      expect(url.searchParams.get('redirect_uri')).toBe(callbackUrl);
      expect(url.searchParams.get('state')).toBe(state);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')?.split(' ')).toEqual(['openid', 'email', 'profile']);
      expect(url.searchParams.get('prompt')).toBe('select_account');
      const input = vi.mocked(oauthStates.create).mock.lastCall?.[0];
      expect(input).toMatchObject({ providerKey: 'google', returnTo: '/app' });
      expect(url.searchParams.get('nonce')).toBe(input?.providerContext.nonce);
      expect(url.searchParams.get('code_challenge')).toBe(
        createHash('sha256')
          .update(input?.providerContext.codeVerifier ?? '')
          .digest('base64url'),
      );
      expect(response.headers.getSetCookie().join(';')).toContain('alfred_oauth_state=');
    }
    expect(oauthStates.create).toHaveBeenCalledTimes(2);
    expect(oauthStates.consume).not.toHaveBeenCalled();
  },
  whenDisabled: async (app) => {
    const providers = await fetch(`${await app.getUrl()}/api/auth/providers`);
    expect(providers.status).toBe(200);
    expect(await providers.json()).toEqual({ success: true, data: [] });
    for (const prefix of ['/api/auth/google', '/api/auth/providers/google']) {
      await expectFeatureRouteHidden(app, 'GET', `${prefix}/start`);
      await expectFeatureRouteHidden(app, 'GET', `${prefix}/callback?code=unused&state=${state}`);
    }
    const oauthStates = app.get<ReturnType<typeof createStatePort>>(OAUTH_STATE_PORT);
    expect(oauthStates.create).not.toHaveBeenCalled();
    expect(oauthStates.consume).not.toHaveBeenCalled();
    expect(app.get<{ create: unknown }>(SESSION_PORT).create).not.toHaveBeenCalled();
    expect(
      app.get<{ upsertVerifiedIdentity: ReturnType<typeof vi.fn> }>(UsersService)
        .upsertVerifiedIdentity,
    ).not.toHaveBeenCalled();
  },
});
