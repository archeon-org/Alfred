import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { OauthCallbackQueryDto } from '@api/modules/auth/api/dto/oauth-callback-query.dto';

const googleCallback = Object.freeze({
  authuser: '0',
  code: 'authorization-code',
  hd: 'example.test',
  iss: 'https://accounts.google.com',
  prompt: 'consent',
  scope: 'email profile https://www.googleapis.com/auth/userinfo.email openid',
  state: 'oauth-state-value-that-is-at-least-32-characters',
});

async function validateCallback(query: Record<string, string>) {
  return validate(plainToInstance(OauthCallbackQueryDto, query), {
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
    whitelist: true,
  });
}

describe('OauthCallbackQueryDto', () => {
  it('accepts the metadata returned by Google with a successful authorization code', async () => {
    await expect(validateCallback(googleCallback)).resolves.toEqual([]);
  });

  it('accepts a bounded standard OAuth authorization error without requiring a code', async () => {
    await expect(
      validateCallback({
        error: 'access_denied',
        error_description: 'The resource owner denied the request.',
        hd: 'example.test',
        state: googleCallback.state,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects callbacks that contain both a code and an authorization error', async () => {
    const errors = await validateCallback({
      code: 'authorization-code',
      error: 'access_denied',
      state: googleCallback.state,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('state');
    expect(errors[0]?.constraints).toEqual({
      oauthCallbackOutcome: 'OAuth callback must contain exactly one of code or error',
    });
  });

  it('rejects callbacks that contain neither a code nor an authorization error', async () => {
    const errors = await validateCallback({ state: googleCallback.state });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('state');
    expect(errors[0]?.constraints).toEqual({
      oauthCallbackOutcome: 'OAuth callback must contain exactly one of code or error',
    });
  });

  it('rejects oversized untrusted callback metadata', async () => {
    const errors = await validateCallback({
      error: 'access_denied',
      error_description: 'x'.repeat(1_025),
      hd: 'x'.repeat(254),
      state: googleCallback.state,
    });

    expect(errors.map(({ property }) => property).sort()).toEqual(['error_description', 'hd']);
  });

  it('continues to reject callback parameters outside the explicit OAuth contract', async () => {
    const errors = await validateCallback({ ...googleCallback, unexpected: 'value' });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('unexpected');
  });

  it('accepts provider-neutral HTTPS issuer metadata and rejects an insecure issuer URL', async () => {
    await expect(
      validateCallback({
        ...googleCallback,
        iss: 'https://login.microsoftonline.com/example/v2.0',
        session_state: 'provider-session-state',
      }),
    ).resolves.toEqual([]);

    const errors = await validateCallback({
      ...googleCallback,
      iss: 'http://accounts.example.test',
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('iss');
  });
});
