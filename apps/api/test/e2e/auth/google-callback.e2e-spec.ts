import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OauthCallbackThrottlerGuard,
  OauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '@api/common/guards/alfred-throttler.guard';
import { AuthController } from '@api/modules/auth/api/auth.controller';
import { AuthCookieService } from '@api/modules/auth/api/cookies/auth-cookie.service';
import { AuthService } from '@api/modules/auth/application/auth.service';

const session = Object.freeze({
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  returnTo: '/app',
  user: {
    displayName: 'Alfred User',
    email: 'person@example.test',
    id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
    role: 'user' as const,
  },
});

describe('Google callback HTTP boundary', () => {
  let app: INestApplication;
  let auth: {
    readonly completeLogin: ReturnType<typeof vi.fn>;
    readonly completeLoginError: ReturnType<typeof vi.fn>;
    readonly createFrontendCallbackErrorUrl: ReturnType<typeof vi.fn>;
    readonly createFrontendCallbackUrl: ReturnType<typeof vi.fn>;
    readonly listProviders: ReturnType<typeof vi.fn>;
    readonly startLogin: ReturnType<typeof vi.fn>;
  };
  let baseUrl: string;

  beforeAll(async () => {
    auth = {
      completeLogin: vi.fn().mockResolvedValue(session),
      completeLoginError: vi.fn().mockResolvedValue('/app'),
      listProviders: vi.fn().mockReturnValue([{ displayName: 'Google', id: 'google' }]),
      startLogin: vi.fn().mockResolvedValue({
        state: 'oauth-state',
        url: 'https://accounts.google.test/authorize',
      }),
      createFrontendCallbackErrorUrl: vi.fn(
        (error: string) => `https://alfred.example.test/auth/callback?error=${error}`,
      ),
      createFrontendCallbackUrl: vi.fn(
        () => 'https://alfred.example.test/auth/callback?returnTo=%2Fapp',
      ),
    };
    const configValues = {
      API_PREFIX: 'api',
      AUTH_COOKIE_SECURE: false,
      AUTH_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
    } as const;
    const config = {
      getOrThrow: vi.fn((key: keyof typeof configValues) => configValues[key]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthCookieService,
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(OauthStartThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OauthCallbackThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RefreshThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        stopAtFirstError: true,
        transform: true,
        validationError: { target: false, value: false },
        whitelist: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo | null | string };
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('HTTP test server failed');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    auth.completeLogin.mockResolvedValue(session);
    auth.completeLoginError.mockResolvedValue('/app');
    auth.listProviders.mockReturnValue([{ displayName: 'Google', id: 'google' }]);
    auth.startLogin.mockResolvedValue({
      state: 'oauth-state',
      url: 'https://accounts.google.test/authorize',
    });
    auth.createFrontendCallbackErrorUrl.mockImplementation(
      (error: string) => `https://alfred.example.test/auth/callback?error=${error}`,
    );
    auth.createFrontendCallbackUrl.mockReturnValue(
      'https://alfred.example.test/auth/callback?returnTo=%2Fapp',
    );
  });

  it('clears the one-time state cookie before the success redirect is committed', async () => {
    const state = 'query-state-value-that-is-at-least-32-characters';
    const response = await fetch(
      `${baseUrl}/api/auth/google/callback?code=authorization-code&state=${state}`,
      {
        headers: { Cookie: 'alfred_oauth_state=cookie-state' },
        redirect: 'manual',
      },
    );
    const setCookies = response.headers.getSetCookie().join('\n');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://alfred.example.test/auth/callback?returnTo=%2Fapp',
    );
    expect(setCookies).toContain('alfred_oauth_state=;');
    expect(setCookies).toContain('alfred_refresh=refresh-token;');
    expect(auth.completeLogin).toHaveBeenCalledWith(
      'google',
      'authorization-code',
      state,
      'cookie-state',
    );
  });

  it('publishes providers and accepts the provider-neutral callback route', async () => {
    const providersResponse = await fetch(`${baseUrl}/api/auth/providers`);
    expect(providersResponse.status).toBe(200);
    await expect(providersResponse.json()).resolves.toEqual({
      data: [{ displayName: 'Google', id: 'google' }],
      success: true,
    });

    const state = 'query-state-value-that-is-at-least-32-characters';
    const callbackResponse = await fetch(
      `${baseUrl}/api/auth/providers/google/callback?code=authorization-code&state=${state}`,
      {
        headers: { Cookie: 'alfred_oauth_state=cookie-state' },
        redirect: 'manual',
      },
    );

    expect(callbackResponse.status).toBe(302);
    expect(auth.completeLogin).toHaveBeenCalledWith(
      'google',
      'authorization-code',
      state,
      'cookie-state',
    );
  });

  it('accepts a provider error and redirects without exposing its description', async () => {
    const state = 'query-state-value-that-is-at-least-32-characters';
    const query = new URLSearchParams({
      error: 'access_denied',
      error_description: 'person@example.test refused provider consent',
      hd: 'example.test',
      state,
    });
    const response = await fetch(`${baseUrl}/api/auth/google/callback?${query.toString()}`, {
      headers: { Cookie: 'alfred_oauth_state=cookie-state' },
      redirect: 'manual',
    });
    const setCookies = response.headers.getSetCookie().join('\n');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://alfred.example.test/auth/callback?error=access_denied',
    );
    expect(response.headers.get('location')).not.toContain('person%40example.test');
    expect(setCookies).toContain('alfred_oauth_state=;');
    expect(auth.completeLoginError).toHaveBeenCalledWith('google', state, 'cookie-state');
  });
});
