import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AuthController } from '@api/modules/auth/api/auth.controller';
import type { AuthCookieService } from '@api/modules/auth/api/cookies/auth-cookie.service';
import type { AuthService } from '@api/modules/auth/application/auth.service';
import { REQUIRED_FEATURE_FLAGS_KEY } from '@api/modules/feature-flags/requires-feature.decorator';

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

function harness() {
  const auth = {
    completeLogin: vi.fn().mockResolvedValue(session),
    completeLoginError: vi.fn().mockResolvedValue('/app'),
    createFrontendCallbackUrl: vi
      .fn()
      .mockReturnValue('https://alfred.example.test/auth/callback?returnTo=%2Fapp'),
    createFrontendCallbackErrorUrl: vi
      .fn()
      .mockReturnValue(
        'https://alfred.example.test/auth/callback?error=access_denied&returnTo=%2Fapp',
      ),
    logout: vi.fn().mockResolvedValue(undefined),
    listProviders: vi.fn().mockReturnValue([{ displayName: 'Google', id: 'google' }]),
    refresh: vi.fn().mockResolvedValue(session),
    startLogin: vi.fn().mockResolvedValue({
      state: 'oauth-state',
      url: 'https://accounts.google.test/authorize',
    }),
  };
  const cookies = {
    clearOauthState: vi.fn(),
    clearRefreshToken: vi.fn(),
    readOauthState: vi.fn().mockReturnValue('cookie-state'),
    readRefreshToken: vi.fn().mockReturnValue('current-refresh-token'),
    setOauthState: vi.fn(),
    setRefreshToken: vi.fn(),
  };
  const controller = new AuthController(
    auth as unknown as AuthService,
    cookies as unknown as AuthCookieService,
  );
  const redirect = vi.fn();
  const response = { redirect } as unknown as Response;

  return { auth, controller, cookies, redirect, response };
}

describe('AuthController', () => {
  it('requires the Google OAuth feature for both provider routes', () => {
    // Decorator metadata is attached to these function objects; the methods are never invoked here.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const startHandler = AuthController.prototype.startGoogleLogin;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const callbackHandler = AuthController.prototype.completeGoogleLogin;

    expect(Reflect.getMetadata(REQUIRED_FEATURE_FLAGS_KEY, startHandler)).toEqual(['googleOAuth']);
    expect(Reflect.getMetadata(REQUIRED_FEATURE_FLAGS_KEY, callbackHandler)).toEqual([
      'googleOAuth',
    ]);
  });

  it('applies independent NAT-tolerant IP buckets to sensitive public routes', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const startHandler = AuthController.prototype.startGoogleLogin;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const callbackHandler = AuthController.prototype.completeGoogleLogin;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const refreshHandler = AuthController.prototype.refresh;

    const guardNames = (handler: object): readonly string[] =>
      (Reflect.getMetadata(GUARDS_METADATA, handler) as readonly { readonly name: string }[]).map(
        ({ name }) => name,
      );

    expect(guardNames(startHandler)).toEqual(['OauthStartThrottlerGuard']);
    expect(guardNames(callbackHandler)).toEqual(['OauthCallbackThrottlerGuard']);
    expect(guardNames(refreshHandler)).toEqual(['SameOriginGuard', 'RefreshThrottlerGuard']);
  });

  it('sets the OAuth state cookie before redirecting to Google', async () => {
    const { auth, controller, cookies, redirect, response } = harness();

    await controller.startGoogleLogin({ returnTo: '/app' }, response);

    expect(auth.startLogin).toHaveBeenCalledWith('google', '/app');
    expect(cookies.setOauthState).toHaveBeenCalledWith(response, 'oauth-state');
    expect(redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'https://accounts.google.test/authorize',
    );
  });

  it('creates cookies and clears the one-time state after a successful callback', async () => {
    const { auth, controller, cookies, redirect, response } = harness();
    const request = {} as Request;

    await controller.completeGoogleLogin(
      { code: 'authorization-code', state: 'query-state' },
      request,
      response,
    );

    expect(auth.completeLogin).toHaveBeenCalledWith(
      'google',
      'authorization-code',
      'query-state',
      'cookie-state',
    );
    expect(cookies.setRefreshToken).toHaveBeenCalledWith(response, 'refresh-token');
    expect(cookies.clearOauthState).toHaveBeenCalledWith(response);
    expect(cookies.clearOauthState.mock.invocationCallOrder[0]).toBeLessThan(
      redirect.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('still clears the one-time state when callback validation fails', async () => {
    const { auth, controller, cookies, response } = harness();
    auth.completeLogin.mockRejectedValueOnce(new UnauthorizedException('invalid state'));

    await expect(
      controller.completeGoogleLogin(
        { code: 'authorization-code', state: 'query-state' },
        {} as Request,
        response,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(cookies.clearOauthState).toHaveBeenCalledWith(response);
    expect(cookies.setRefreshToken).not.toHaveBeenCalled();
  });

  it('consumes a provider-declared OAuth error and redirects without exposing its description', async () => {
    const { auth, controller, cookies, redirect, response } = harness();

    await controller.completeGoogleLogin(
      {
        error: 'access_denied',
        error_description: 'user@example.test refused provider consent',
        hd: 'example.test',
        state: 'query-state',
      },
      {} as Request,
      response,
    );

    expect(auth.completeLoginError).toHaveBeenCalledWith('google', 'query-state', 'cookie-state');
    expect(auth.completeLogin).not.toHaveBeenCalled();
    expect(auth.createFrontendCallbackErrorUrl).toHaveBeenCalledWith('access_denied', '/app');
    expect(cookies.setRefreshToken).not.toHaveBeenCalled();
    expect(cookies.clearOauthState.mock.invocationCallOrder[0]).toBeLessThan(
      redirect.mock.invocationCallOrder[0] ?? 0,
    );
    expect(redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'https://alfred.example.test/auth/callback?error=access_denied&returnTo=%2Fapp',
    );
    expect(JSON.stringify(redirect.mock.calls)).not.toContain('user@example.test');
  });

  it('exposes enabled providers and routes a generic provider start through the registry', async () => {
    const { auth, controller, response } = harness();

    expect(controller.listProviders()).toEqual({
      data: [{ displayName: 'Google', id: 'google' }],
      success: true,
    });
    await controller.startProviderLogin({ provider: 'microsoft' }, { returnTo: '/app' }, response);
    expect(auth.startLogin).toHaveBeenCalledWith('microsoft', '/app');
  });

  it('rotates refresh cookies and returns only the access token and public user', async () => {
    const { controller, cookies, response } = harness();

    await expect(controller.refresh({} as Request, response)).resolves.toEqual({
      data: { accessToken: 'access-token', user: session.user },
      success: true,
    });
    expect(cookies.setRefreshToken).toHaveBeenCalledWith(response, 'refresh-token');
  });

  it('clears stale cookies when refresh is missing or rejected', async () => {
    const missing = harness();
    missing.cookies.readRefreshToken.mockReturnValueOnce(undefined);
    await expect(missing.controller.refresh({} as Request, missing.response)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(missing.cookies.clearRefreshToken).toHaveBeenCalledWith(missing.response);

    const rejected = harness();
    rejected.auth.refresh.mockRejectedValueOnce(new UnauthorizedException('reuse detected'));
    await expect(rejected.controller.refresh({} as Request, rejected.response)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(rejected.cookies.clearRefreshToken).toHaveBeenCalledWith(rejected.response);
  });

  it('preserves the refresh cookie when rotation fails transiently', async () => {
    const { auth, controller, cookies, response } = harness();
    auth.refresh.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(controller.refresh({} as Request, response)).rejects.toThrow(
      'database unavailable',
    );
    expect(cookies.clearRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes the refresh family and clears the browser cookie on logout', async () => {
    const { auth, controller, cookies, response } = harness();

    await controller.logout({} as Request, response);

    expect(auth.logout).toHaveBeenCalledWith('current-refresh-token');
    expect(cookies.clearRefreshToken).toHaveBeenCalledWith(response);
  });

  it('preserves the browser cookie when server-side revocation is unavailable', async () => {
    const { auth, controller, cookies, response } = harness();
    auth.logout.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(controller.logout({} as Request, response)).rejects.toThrow(
      'database unavailable',
    );
    expect(cookies.clearRefreshToken).not.toHaveBeenCalled();
  });
});
