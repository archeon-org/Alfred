import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GoogleOauthCallbackThrottlerGuard,
  GoogleOauthStartThrottlerGuard,
  RefreshThrottlerGuard,
} from '../../src/common/guards/alfred-throttler.guard';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthCookieService } from '../../src/modules/auth/services/auth-cookie.service';

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
    readonly completeGoogleLogin: ReturnType<typeof vi.fn>;
    readonly completeGoogleLoginError: ReturnType<typeof vi.fn>;
    readonly createFrontendCallbackErrorUrl: ReturnType<typeof vi.fn>;
    readonly createFrontendCallbackUrl: ReturnType<typeof vi.fn>;
  };
  let baseUrl: string;

  beforeAll(async () => {
    auth = {
      completeGoogleLogin: vi.fn().mockResolvedValue(session),
      completeGoogleLoginError: vi.fn().mockResolvedValue('/app'),
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
      .overrideGuard(GoogleOauthStartThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(GoogleOauthCallbackThrottlerGuard)
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
    auth.completeGoogleLogin.mockResolvedValue(session);
    auth.completeGoogleLoginError.mockResolvedValue('/app');
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
    expect(auth.completeGoogleLogin).toHaveBeenCalledWith(
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
    expect(auth.completeGoogleLoginError).toHaveBeenCalledWith(state, 'cookie-state');
  });
});
