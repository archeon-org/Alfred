import type { AddressInfo } from 'node:net';
import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';
import { MetricsService } from '../../src/observability/metrics.service';
import { ObservabilityModule } from '../../src/observability/observability.module';

@Injectable()
class OutcomeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const outcome = context.switchToHttp().getRequest<Request>().params.outcome;
    if (outcome === 'unauthorized') throw new UnauthorizedException();
    if (outcome === 'forbidden') throw new ForbiddenException();
    if (outcome === 'not-found') throw new NotFoundException();
    if (outcome === 'throttled') {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

@Controller('observed')
class ObservedController {
  @Get(':outcome')
  respond(@Param('outcome') outcome: string): { readonly status: 'ok' } {
    if (outcome === 'failure') throw new Error('sensitive handler failure');
    return { status: 'ok' };
  }
}

describe('HTTP observability completion boundary', () => {
  let app: INestApplication;
  let baseUrl: string;
  let metrics: MetricsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              OBSERVABILITY_LOG_LEVEL: 'info',
              OBSERVABILITY_METRICS_ENABLED: true,
              OBSERVABILITY_METRICS_TOKEN: 'test-metrics-token',
            }),
          ],
        }),
        ObservabilityModule,
      ],
      controllers: [ObservedController],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: OutcomeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo | null | string };
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('HTTP test server failed');
    baseUrl = `http://127.0.0.1:${address.port}`;
    metrics = moduleRef.get(MetricsService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('records guard rejections and handler errors once with their final status', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const outcomes = ['unauthorized', 'forbidden', 'not-found', 'throttled', 'failure'] as const;

    const responses = [];
    for (const outcome of outcomes) {
      responses.push(await fetch(`${baseUrl}/observed/${outcome}?token=must-not-leak`));
    }

    expect(responses.map(({ status }) => status)).toEqual([401, 403, 404, 429, 500]);
    const completionRecords = write.mock.calls
      .map(([value]) => JSON.parse(String(value)) as Record<string, unknown>)
      .filter(({ event }) => event === 'http_request_completed');
    expect(completionRecords).toHaveLength(outcomes.length);
    expect(completionRecords.map(({ statusCode }) => statusCode)).toEqual([
      401, 403, 404, 429, 500,
    ]);
    expect(completionRecords.every(({ route }) => route === '/observed/:outcome')).toBe(true);
    expect(JSON.stringify(completionRecords)).not.toContain('must-not-leak');

    const payload = await metrics.render();
    for (const statusCode of [401, 403, 404, 429, 500]) {
      expect(payload).toContain(
        `alfred_api_http_requests_total{method="GET",route="/observed/:outcome",status_code="${statusCode}"} 1`,
      );
    }
  });
});
