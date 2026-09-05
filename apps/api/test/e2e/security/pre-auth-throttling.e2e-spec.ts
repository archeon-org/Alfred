import type { AddressInfo } from 'node:net';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { IpThrottlerGuard } from '@api/common/guards/alfred-throttler.guard';

@Controller('private-probe')
class PrivateProbeController {
  @Get('first')
  first(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('second')
  second(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}

describe('pre-authentication throttling boundary', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ limit: 2, name: 'ip', ttl: 60_000 }],
        }),
      ],
      controllers: [PrivateProbeController],
      providers: [
        { provide: APP_GUARD, useClass: IpThrottlerGuard },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
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

  it('shares the IP quota across handlers before access-token rejection', async () => {
    const request = (handler: 'first' | 'second') =>
      fetch(`${baseUrl}/private-probe/${handler}`, {
        headers: { Authorization: 'Bearer invalid-token' },
      });
    const responses = [await request('first'), await request('second'), await request('first')];

    expect(responses.map(({ status }) => status)).toEqual([401, 401, 429]);
  });
});
