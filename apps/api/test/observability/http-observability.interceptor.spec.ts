import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { HttpObservabilityInterceptor } from '../../src/observability/http-observability.interceptor';
import type { MetricsService } from '../../src/observability/metrics.service';
import type { JsonLoggerService } from '../../src/observability/json-logger.service';

describe('HttpObservabilityInterceptor', () => {
  it('records the route template without query strings or user identifiers', async () => {
    const recordHttpRequest = vi.fn();
    const metrics = { recordHttpRequest } as unknown as MetricsService;
    const httpRequestCompleted = vi.fn();
    const logger = { httpRequestCompleted } as unknown as JsonLoggerService;
    const interceptor = new HttpObservabilityInterceptor(metrics, logger);
    const executionContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          baseUrl: '/api/users',
          method: 'GET',
          originalUrl: '/api/users/123?token=sensitive',
          route: { path: '/:id' },
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      interceptor.intercept(executionContext, { handle: () => of('ok') } as CallHandler),
    );

    expect(recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: '/api/users/:id', statusCode: 200 }),
    );
    expect(httpRequestCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: '/api/users/:id', statusCode: 200 }),
    );
    expect(JSON.stringify(httpRequestCompleted.mock.calls)).not.toContain('sensitive');
  });
});
