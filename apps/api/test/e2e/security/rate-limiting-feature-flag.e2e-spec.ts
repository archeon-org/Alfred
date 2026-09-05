import type { AddressInfo } from 'node:net';
import { Controller, Get, type INestApplication, UseGuards } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createThrottlerOptions } from '@api/app.module';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import {
  IpThrottlerGuard,
  OauthStartThrottlerGuard,
} from '@api/common/guards/alfred-throttler.guard';
import { Public } from '@api/common/decorators/public.decorator';
import type { RedisThrottlerStorage } from '@api/infrastructure/redis/redis-throttler.storage';
import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';

@Controller('flagged-throttle-probe')
class FlaggedThrottleProbeController {
  @Get('private')
  privateProbe(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @UseGuards(OauthStartThrottlerGuard)
  @Get('oauth-start')
  oauthStartProbe(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}

describe('rate limiting feature flag', () => {
  let app: INestApplication;
  let baseUrl: string;
  const throttleIncrement = vi.fn();

  beforeAll(async () => {
    const featureFlags = {
      isEnabled: vi.fn().mockReturnValue(false),
    } as unknown as FeatureFlagsService;
    const config = { getOrThrow: vi.fn().mockReturnValue(2) } as unknown as ConfigService;
    const storage = {
      increment: throttleIncrement,
    } as unknown as RedisThrottlerStorage;
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(createThrottlerOptions(storage, config, featureFlags))],
      controllers: [FlaggedThrottleProbeController],
      providers: [
        { provide: APP_GUARD, useClass: IpThrottlerGuard },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
        OauthStartThrottlerGuard,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: () => Promise.reject(new Error('invalid signature')),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo | null | string };
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('HTTP test server failed');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('bypasses global and route-specific throttlers when disabled', async () => {
    const privateResponses = [];
    const publicResponses = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      privateResponses.push(
        await fetch(`${baseUrl}/flagged-throttle-probe/private`, {
          headers: { Authorization: 'Bearer invalid-token' },
        }),
      );
      publicResponses.push(await fetch(`${baseUrl}/flagged-throttle-probe/oauth-start`));
    }

    expect(privateResponses.map(({ status }) => status)).toEqual([401, 401, 401]);
    expect(publicResponses.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(throttleIncrement).not.toHaveBeenCalled();
  });
});
