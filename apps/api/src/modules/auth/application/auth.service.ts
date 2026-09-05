import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { IdentityProviderDescriptor } from '../domain/ports/identity-provider';
import { OAUTH_STATE_PORT, type OauthStatePort } from '../domain/ports/oauth-state.port';
import { SESSION_PORT, type IssuedSession, type SessionPort } from '../domain/ports/session.port';
import { IdentityProviderRegistry } from './identity-provider.registry';

export interface LoginStart {
  readonly state: string;
  readonly url: string;
}

export interface LoginCompletion extends IssuedSession {
  readonly returnTo: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly providers: IdentityProviderRegistry,
    @Inject(OAUTH_STATE_PORT) private readonly oauthStates: OauthStatePort,
    @Inject(SESSION_PORT) private readonly sessions: SessionPort,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  listProviders(): readonly IdentityProviderDescriptor[] {
    return this.providers.listEnabled();
  }

  async startLogin(providerKey: string, returnTo: string): Promise<LoginStart> {
    const provider = this.providers.requireEnabled(providerKey);
    const challenge = await provider.createChallenge();
    const state = await this.oauthStates.create({
      providerContext: challenge,
      providerKey,
      returnTo,
    });
    return Object.freeze({
      state,
      url: provider.createAuthorizationUrl(state, challenge),
    });
  }

  async completeLogin(
    providerKey: string,
    credential: string,
    state: string,
    cookieState: string | undefined,
  ): Promise<LoginCompletion> {
    const provider = this.providers.requireEnabled(providerKey);
    const loginState = await this.oauthStates.consume(providerKey, state, cookieState);
    const identity = await provider.verifyCallback(credential, loginState.providerContext);
    const user = await this.users.upsertVerifiedIdentity(identity);
    const session = await this.sessions.create(user);
    return Object.freeze({ ...session, returnTo: loginState.returnTo });
  }

  async completeLoginError(
    providerKey: string,
    state: string,
    cookieState: string | undefined,
  ): Promise<string> {
    this.providers.requireEnabled(providerKey);
    const loginState = await this.oauthStates.consume(providerKey, state, cookieState);
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
