import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import type { IssuedSession } from './services/refresh-session.service';
import { RefreshSessionService } from './services/refresh-session.service';
import { GoogleOidcService } from './services/google-oidc.service';
import { OauthStateService } from './services/oauth-state.service';

export interface GoogleLoginStart {
  readonly state: string;
  readonly url: string;
}

export interface GoogleLoginCompletion extends IssuedSession {
  readonly returnTo: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly google: GoogleOidcService,
    private readonly oauthStates: OauthStateService,
    private readonly sessions: RefreshSessionService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async startGoogleLogin(returnTo: string): Promise<GoogleLoginStart> {
    const challenge = await this.google.createChallenge();
    const state = await this.oauthStates.create({
      codeVerifier: challenge.codeVerifier,
      nonce: challenge.nonce,
      returnTo,
    });
    return Object.freeze({
      state,
      url: this.google.createAuthorizationUrl(state, challenge),
    });
  }

  async completeGoogleLogin(
    code: string,
    state: string,
    cookieState: string | undefined,
  ): Promise<GoogleLoginCompletion> {
    const loginState = await this.oauthStates.consume(state, cookieState);
    const identity = await this.google.exchangeCode(
      code,
      loginState.codeVerifier,
      loginState.nonce,
    );
    const user = await this.users.upsertVerifiedIdentity(identity);
    const session = await this.sessions.create(user);
    return Object.freeze({ ...session, returnTo: loginState.returnTo });
  }

  async completeGoogleLoginError(state: string, cookieState: string | undefined): Promise<string> {
    const loginState = await this.oauthStates.consume(state, cookieState);
    return loginState.returnTo;
  }

  refresh(refreshToken: string): Promise<IssuedSession> {
    return this.sessions.rotate(refreshToken);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return this.sessions.revoke(refreshToken);
  }

  createFrontendCallbackUrl(returnTo: string): string {
    const url = new URL('/auth/callback', this.config.getOrThrow<string>('WEB_APP_URL'));
    url.searchParams.set('returnTo', returnTo);
    return url.toString();
  }

  createFrontendCallbackErrorUrl(error: string, returnTo: string): string {
    const url = new URL('/auth/callback', this.config.getOrThrow<string>('WEB_APP_URL'));
    url.searchParams.set('error', error);
    url.searchParams.set('returnTo', returnTo);
    return url.toString();
  }
}
