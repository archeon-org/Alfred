import type { AddressInfo } from 'node:net';
import { Controller, Get, type INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Public } from '@api/common/decorators/public.decorator';
import { OauthStartThrottlerGuard } from '@api/common/guards/alfred-throttler.guard';

@Controller('oauth-start-probe')
class OauthStartProbeController {
  @Public()
  @UseGuards(OauthStartThrottlerGuard)
  @Get()
  probe(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}

describe('route-specific authentication throttling boundary', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ limit: 2, name: 'oauth-start-ip', ttl: 60_000 }],
        }),
      ],
      controllers: [OauthStartProbeController],
      providers: [OauthStartThrottlerGuard],
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

  it('uses its own named IP bucket', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      responses.push(await fetch(`${baseUrl}/oauth-start-probe`));
    }

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 429]);
  });
});
