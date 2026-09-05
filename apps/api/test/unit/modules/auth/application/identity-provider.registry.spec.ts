import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { IdentityProviderRegistry } from '@api/modules/auth/application/identity-provider.registry';
import type { IdentityProvider } from '@api/modules/auth/domain/ports/identity-provider';

function provider(key: string, displayName: string, enabled = true): IdentityProvider {
  return {
    createAuthorizationUrl: () => 'https://identity.example.test',
    createChallenge: () => Promise.resolve(Object.freeze({})),
    displayName,
    isEnabled: () => enabled,
    key,
    verifyCallback: () => Promise.reject(new Error('not used')),
  };
}

describe('IdentityProviderRegistry', () => {
  it('publishes enabled providers in stable display order', () => {
    const registry = new IdentityProviderRegistry([
      provider('microsoft', 'Microsoft'),
      provider('disabled', 'Disabled', false),
      provider('google', 'Google'),
    ]);

    expect(registry.listEnabled()).toEqual([
      { displayName: 'Google', id: 'google' },
      { displayName: 'Microsoft', id: 'microsoft' },
    ]);
  });

  it('rejects unknown, disabled and duplicate providers', () => {
    const registry = new IdentityProviderRegistry([provider('google', 'Google')]);
    expect(() => registry.requireEnabled('microsoft')).toThrow(NotFoundException);

    const disabled = new IdentityProviderRegistry([provider('microsoft', 'Microsoft', false)]);
    expect(() => disabled.requireEnabled('microsoft')).toThrow(NotFoundException);
    expect(
      () =>
        new IdentityProviderRegistry([
          provider('google', 'Google'),
          provider('google', 'Duplicate'),
        ]),
    ).toThrow('Identity provider keys must be unique');
  });
});
