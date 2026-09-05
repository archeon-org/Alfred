import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

@Injectable()
export class AuthCookieService {
  private readonly oauthStateCookieName: string;
  private readonly refreshCookieName: string;
  private readonly refreshOptions: CookieOptions;
  private readonly oauthStateOptions: CookieOptions;

  constructor(config: ConfigService) {
    const secure = config.getOrThrow<boolean>('AUTH_COOKIE_SECURE');
    const prefix = config.getOrThrow<string>('API_PREFIX');
    const baseOptions: CookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure,
    };

    this.refreshCookieName = secure ? '__Host-alfred_refresh' : 'alfred_refresh';
    this.oauthStateCookieName = secure ? '__Host-alfred_oauth_state' : 'alfred_oauth_state';
    this.refreshOptions = Object.freeze({
      ...baseOptions,
      maxAge: config.getOrThrow<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS') * 1000,
      path: secure ? '/' : `/${prefix}/auth`,
    });
    this.oauthStateOptions = Object.freeze({
      ...baseOptions,
      maxAge: 10 * 60 * 1000,
      path: secure ? '/' : `/${prefix}/auth`,
    });
  }

  readRefreshToken(request: Request): string | undefined {
    return this.readCookie(request, this.refreshCookieName);
  }

  readOauthState(request: Request): string | undefined {
    return this.readCookie(request, this.oauthStateCookieName);
  }

  setRefreshToken(response: Response, token: string): void {
    response.cookie(this.refreshCookieName, token, this.refreshOptions);
  }

  clearRefreshToken(response: Response): void {
    response.clearCookie(this.refreshCookieName, this.refreshOptions);
  }

  setOauthState(response: Response, state: string): void {
    response.cookie(this.oauthStateCookieName, state, this.oauthStateOptions);
  }

  clearOauthState(response: Response): void {
    response.clearCookie(this.oauthStateCookieName, this.oauthStateOptions);
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
