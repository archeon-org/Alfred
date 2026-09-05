import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IDENTITY_PROVIDERS,
  type IdentityProvider,
  type IdentityProviderDescriptor,
} from '../domain/ports/identity-provider';

@Injectable()
export class IdentityProviderRegistry {
  private readonly providers: ReadonlyMap<string, IdentityProvider>;

  constructor(@Inject(IDENTITY_PROVIDERS) providers: readonly IdentityProvider[]) {
    const entries = providers.map((provider) => [provider.key, provider] as const);
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new Error('Identity provider keys must be unique');
    }
    this.providers = new Map(entries);
  }

  listEnabled(): readonly IdentityProviderDescriptor[] {
    return Object.freeze(
      [...this.providers.values()]
        .filter((provider) => provider.isEnabled())
        .map((provider) => Object.freeze({ displayName: provider.displayName, id: provider.key }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    );
  }

  requireEnabled(key: string): IdentityProvider {
    const provider = this.providers.get(key);
    if (provider === undefined || !provider.isEnabled()) {
      throw new NotFoundException('Authentication provider is unavailable');
    }
    return provider;
  }
}
