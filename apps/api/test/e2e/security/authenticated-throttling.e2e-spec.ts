import type { AddressInfo } from 'node:net';
import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthenticatedThrottlerGuard } from '@api/common/guards/alfred-throttler.guard';

interface AuthenticatedRequest extends Request {
  user?: { readonly id: string };
}

@Injectable()
class TestPrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<AuthenticatedRequest>().user = { id: 'shared-user' };
    return true;
  }
}

@Controller('authenticated-probe')
class AuthenticatedProbeController {
  @Get('first')
  first(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('second')
  second(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}

describe('authenticated-user throttling boundary', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ limit: 2, name: 'authenticated', ttl: 60_000 }],
        }),
      ],
      controllers: [AuthenticatedProbeController],
      providers: [
        { provide: APP_GUARD, useClass: TestPrincipalGuard },
        { provide: APP_GUARD, useClass: AuthenticatedThrottlerGuard },
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

  it('shares one authenticated-user quota across handlers', async () => {
    const request = (handler: 'first' | 'second') =>
      fetch(`${baseUrl}/authenticated-probe/${handler}`);
    const responses = [await request('first'), await request('second'), await request('first')];

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 429]);
  });
});
