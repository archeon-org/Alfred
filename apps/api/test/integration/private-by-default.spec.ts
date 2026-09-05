import type { Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { AlfredThrottlerGuard } from '../../src/common/guards/alfred-throttler.guard';
import { AccessTokenGuard } from '../../src/common/guards/access-token.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { FeatureFlagGuard } from '../../src/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '../../src/modules/feature-flags/feature-flags.controller';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { HealthController } from '../../src/modules/health/health.controller';
import { PlatformController } from '../../src/modules/platform/platform.controller';

function appProviders(): readonly Provider[] {
  return Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as readonly Provider[];
}

describe('private-by-default application policy', () => {
  it('registers authentication, authorization and throttling as application guards', () => {
    expect(appProviders()).toEqual(
      expect.arrayContaining([
        { provide: APP_GUARD, useClass: AlfredThrottlerGuard },
        { provide: APP_GUARD, useClass: FeatureFlagGuard },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ]),
    );
  });

  it('keeps operational health explicitly public while feature routes stay protected', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, FeatureFlagsController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PlatformController)).toBeUndefined();
  });
});
