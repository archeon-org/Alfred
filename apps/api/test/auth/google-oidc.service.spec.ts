import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const google = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  generateCodeVerifierAsync: vi.fn(),
  getToken: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  CodeChallengeMethod: { S256: 'S256' },
  OAuth2Client: class {
    generateAuthUrl = google.generateAuthUrl;
    generateCodeVerifierAsync = google.generateCodeVerifierAsync;
    getToken = google.getToken;
    verifyIdToken = google.verifyIdToken;
  },
}));

import { GoogleOidcService } from '../../src/modules/auth/services/google-oidc.service';
import type { FeatureFlagsService } from '../../src/modules/feature-flags/feature-flags.service';

function config(overrides: Readonly<Record<string, unknown>> = {}): ConfigService {
  const values: Readonly<Record<string, unknown>> = {
    GOOGLE_OAUTH_CALLBACK_URL: 'https://api.example.test/api/auth/google/callback',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    ...overrides,
  };
  return {
    get: vi.fn((key: string) => values[key]),
    getOrThrow: vi.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

function featureFlags(enabled = true): FeatureFlagsService {
  return { isEnabled: vi.fn().mockReturnValue(enabled) } as unknown as FeatureFlagsService;
}

describe('GoogleOidcService', () => {
  beforeEach(() => {
    google.generateAuthUrl.mockReset();
    google.generateCodeVerifierAsync.mockReset();
    google.getToken.mockReset();
    google.verifyIdToken.mockReset();
  });

  it('fails closed when the provider is disabled', async () => {
    const service = new GoogleOidcService(config(), featureFlags(false));

    expect(service.isEnabled()).toBe(false);
    await expect(service.createChallenge()).rejects.toThrow(ServiceUnavailableException);
  });

  it('creates a PKCE S256 authorization request with minimal OIDC scopes', async () => {
    google.generateCodeVerifierAsync.mockResolvedValue({
      codeChallenge: 'challenge',
      codeVerifier: 'verifier',
    });
    google.generateAuthUrl.mockReturnValue('https://accounts.google.test/authorize');
    const service = new GoogleOidcService(config(), featureFlags());

    const challenge = await service.createChallenge();
    expect(challenge).toMatchObject({ codeChallenge: 'challenge', codeVerifier: 'verifier' });
    expect(service.createAuthorizationUrl('oauth-state', challenge)).toBe(
      'https://accounts.google.test/authorize',
    );
    expect(google.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        code_challenge_method: 'S256',
        scope: ['openid', 'email', 'profile'],
        state: 'oauth-state',
      }),
    );
  });

  it('fails closed if the PKCE provider does not return a challenge', async () => {
    google.generateCodeVerifierAsync.mockResolvedValue({ codeVerifier: 'verifier' });
    const service = new GoogleOidcService(config(), featureFlags());

    await expect(service.createChallenge()).rejects.toThrow(ServiceUnavailableException);
  });

  it('exchanges the code and validates issuer payload, nonce, email and optional domain', async () => {
    google.getToken.mockResolvedValue({ tokens: { id_token: 'google-id-token' } });
    google.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'person@example.test',
        email_verified: true,
        hd: 'example.test',
        name: 'Alfred User',
        nonce: 'expected-nonce',
        picture: 'https://example.test/avatar.png',
        sub: 'google-subject',
      }),
    });
    const service = new GoogleOidcService(
      config({ GOOGLE_WORKSPACE_DOMAIN: 'example.test' }),
      featureFlags(),
    );

    await expect(
      service.exchangeCode('authorization-code', 'verifier', 'expected-nonce'),
    ).resolves.toEqual({
      avatarUrl: 'https://example.test/avatar.png',
      displayName: 'Alfred User',
      email: 'person@example.test',
      issuer: 'https://accounts.google.com',
      provider: 'google',
      subject: 'google-subject',
    });
    expect(google.getToken).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'authorization-code', codeVerifier: 'verifier' }),
    );
  });

  it.each(['', '   '])(
    'treats a blank Workspace domain from the container environment as unrestricted',
    async (workspaceDomain) => {
      google.getToken.mockResolvedValue({ tokens: { id_token: 'google-id-token' } });
      google.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'person@gmail.com',
          email_verified: true,
          nonce: 'expected-nonce',
          sub: 'google-subject',
        }),
      });
      const service = new GoogleOidcService(
        config({ GOOGLE_WORKSPACE_DOMAIN: workspaceDomain }),
        featureFlags(),
      );

      await expect(
        service.exchangeCode('authorization-code', 'verifier', 'expected-nonce'),
      ).resolves.toMatchObject({ email: 'person@gmail.com' });
    },
  );

  it('normalizes a configured Workspace domain before enforcing it', async () => {
    google.getToken.mockResolvedValue({ tokens: { id_token: 'google-id-token' } });
    google.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'person@example.test',
        email_verified: true,
        hd: 'example.test',
        nonce: 'expected-nonce',
        sub: 'google-subject',
      }),
    });
    const service = new GoogleOidcService(
      config({ GOOGLE_WORKSPACE_DOMAIN: ' Example.Test ' }),
      featureFlags(),
    );

    await expect(
      service.exchangeCode('authorization-code', 'verifier', 'expected-nonce'),
    ).resolves.toMatchObject({ email: 'person@example.test' });
  });

  it('rejects missing tokens, nonce mismatches and foreign Workspace domains', async () => {
    const service = new GoogleOidcService(
      config({ GOOGLE_WORKSPACE_DOMAIN: 'example.test' }),
      featureFlags(),
    );

    google.getToken.mockResolvedValueOnce({ tokens: {} });
    await expect(service.exchangeCode('code', 'verifier', 'nonce')).rejects.toThrow(
      UnauthorizedException,
    );

    google.getToken.mockResolvedValue({ tokens: { id_token: 'google-id-token' } });
    google.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        email: 'person@example.test',
        email_verified: true,
        hd: 'example.test',
        nonce: 'wrong-nonce',
        sub: 'google-subject',
      }),
    });
    await expect(service.exchangeCode('code', 'verifier', 'nonce')).rejects.toThrow(
      'Google identity validation failed',
    );

    google.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        email: 'person@foreign.test',
        email_verified: true,
        hd: 'foreign.test',
        nonce: 'nonce',
        sub: 'google-subject',
      }),
    });
    await expect(service.exchangeCode('code', 'verifier', 'nonce')).rejects.toThrow(
      'Google Workspace domain is not allowed',
    );
  });
});
