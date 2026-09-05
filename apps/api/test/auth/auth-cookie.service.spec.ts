import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AuthCookieService } from '../../src/modules/auth/services/auth-cookie.service';

function config(secure: boolean): ConfigService {
  const values: Readonly<Record<string, unknown>> = {
    API_PREFIX: 'api',
    AUTH_COOKIE_SECURE: secure,
    AUTH_REFRESH_TOKEN_TTL_SECONDS: 3600,
  };
  return {
    getOrThrow: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function response() {
  const clearCookie = vi.fn();
  const cookie = vi.fn();
  return {
    clearCookie,
    cookie,
    value: { clearCookie, cookie } as unknown as Response,
  };
}

describe('AuthCookieService', () => {
  it('uses host-bound secure HttpOnly cookies in production', () => {
    const service = new AuthCookieService(config(true));
    const output = response();

    service.setRefreshToken(output.value, 'refresh-token');
    service.setOauthState(output.value, 'oauth-state');

    expect(output.cookie).toHaveBeenCalledWith(
      '__Host-alfred_refresh',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, path: '/', sameSite: 'lax', secure: true }),
    );
    expect(output.cookie).toHaveBeenCalledWith(
      '__Host-alfred_oauth_state',
      'oauth-state',
      expect.objectContaining({ httpOnly: true, path: '/', secure: true }),
    );
  });

  it('scopes non-secure development cookies to authentication routes', () => {
    const service = new AuthCookieService(config(false));
    const output = response();

    service.setRefreshToken(output.value, 'refresh-token');
    service.clearRefreshToken(output.value);
    service.clearOauthState(output.value);

    expect(output.cookie).toHaveBeenCalledWith(
      'alfred_refresh',
      'refresh-token',
      expect.objectContaining({ path: '/api/auth', secure: false }),
    );
    expect(output.clearCookie).toHaveBeenCalledWith(
      'alfred_oauth_state',
      expect.objectContaining({ path: '/api/auth/google/callback' }),
    );
  });

  it('reads only non-empty string cookie values', () => {
    const service = new AuthCookieService(config(false));

    expect(
      service.readRefreshToken({
        cookies: { alfred_refresh: 'refresh-token' },
      } as unknown as Request),
    ).toBe('refresh-token');
    expect(
      service.readRefreshToken({ cookies: { alfred_refresh: 42 } } as unknown as Request),
    ).toBe(undefined);
    expect(service.readOauthState({ cookies: {} } as unknown as Request)).toBeUndefined();
  });
});
