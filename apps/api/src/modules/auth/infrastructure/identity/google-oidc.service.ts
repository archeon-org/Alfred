import { randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { VerifiedIdentity } from '../../../users/users.service';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type {
  IdentityProvider,
  IdentityProviderContext,
} from '../../domain/ports/identity-provider';

const GOOGLE_ISSUER = 'https://accounts.google.com';

@Injectable()
export class GoogleOidcService implements IdentityProvider {
  readonly displayName = 'Google';
  readonly key = 'google';
  private readonly client: OAuth2Client | null;
  private readonly clientId: string | undefined;
  private readonly callbackUrl: string | undefined;
  private readonly workspaceDomain: string | undefined;

  constructor(
    private readonly config: ConfigService,
    featureFlags: FeatureFlagsService,
  ) {
    const enabled = featureFlags.isEnabled('googleOAuth');
    this.clientId = config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    this.callbackUrl = config.get<string>('GOOGLE_OAUTH_CALLBACK_URL');
    const workspaceDomain = config.get<string>('GOOGLE_WORKSPACE_DOMAIN')?.trim().toLowerCase();
    this.workspaceDomain = workspaceDomain === '' ? undefined : workspaceDomain;
    this.client = enabled
      ? new OAuth2Client({
          clientId: this.clientId,
          clientSecret: config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
          redirectUri: this.callbackUrl,
        })
      : null;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async createChallenge(): Promise<IdentityProviderContext> {
    const client = this.requireClient();
    const { codeChallenge, codeVerifier } = await client.generateCodeVerifierAsync();
    if (codeChallenge === undefined) {
      throw new ServiceUnavailableException('Google PKCE challenge generation failed');
    }
    return Object.freeze({
      codeChallenge,
      codeVerifier,
      nonce: randomBytes(32).toString('base64url'),
    });
  }

  createAuthorizationUrl(state: string, challenge: IdentityProviderContext): string {
    const client = this.requireClient();
    const codeChallenge = this.requireContextValue(challenge, 'codeChallenge');
    const nonce = this.requireContextValue(challenge, 'nonce');
    return client.generateAuthUrl({
      access_type: 'online',
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      include_granted_scopes: true,
      nonce,
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
      state,
    });
  }

  async verifyCallback(code: string, context: IdentityProviderContext): Promise<VerifiedIdentity> {
    const client = this.requireClient();
    const codeVerifier = this.requireContextValue(context, 'codeVerifier');
    const nonce = this.requireContextValue(context, 'nonce');
    const { tokens } = await client.getToken({
      code,
      codeVerifier,
      redirect_uri: this.callbackUrl,
    });
    if (typeof tokens.id_token !== 'string' || this.clientId === undefined) {
      throw new UnauthorizedException('Google did not return a valid identity token');
    }

    const ticket = await client.verifyIdToken({
      audience: this.clientId,
      idToken: tokens.id_token,
    });
    const payload = ticket.getPayload();
    if (
      payload === undefined ||
      payload.nonce !== nonce ||
      payload.email_verified !== true ||
      payload.email === undefined ||
      payload.sub === undefined
    ) {
      throw new UnauthorizedException('Google identity validation failed');
    }
    if (this.workspaceDomain !== undefined && payload.hd !== this.workspaceDomain) {
      throw new UnauthorizedException('Google Workspace domain is not allowed');
    }

    return Object.freeze({
      avatarUrl: payload.picture ?? null,
      displayName: payload.name?.trim() || payload.email,
      email: payload.email,
      issuer: GOOGLE_ISSUER,
      provider: 'google',
      subject: payload.sub,
    });
  }

  private requireClient(): OAuth2Client {
    if (this.client === null) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }
    return this.client;
  }

  private requireContextValue(context: IdentityProviderContext, key: string): string {
    const value = context[key];
    if (typeof value !== 'string' || value === '') {
      throw new UnauthorizedException('Google login context is invalid');
    }
    return value;
  }
}
