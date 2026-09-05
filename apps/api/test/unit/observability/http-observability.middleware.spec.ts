import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { HttpObservabilityMiddleware } from '@api/observability/http-observability.middleware';
import type { JsonLoggerService } from '@api/observability/json-logger.service';
import type { MetricsService } from '@api/observability/metrics.service';

describe('HttpObservabilityMiddleware', () => {
  it('records the final status exactly once after guards and filters finish the response', () => {
    const recordHttpRequest = vi.fn();
    const httpRequestCompleted = vi.fn();
    const middleware = new HttpObservabilityMiddleware(
      { recordHttpRequest } as unknown as MetricsService,
      { httpRequestCompleted } as unknown as JsonLoggerService,
    );
    const request = {
      baseUrl: '/api/users',
      method: 'GET',
      originalUrl: '/api/users/123?token=sensitive',
      route: { path: '/:id' },
    } as unknown as Request;
    const response = new EventEmitter() as unknown as Response;
    response.statusCode = 200;
    const next = vi.fn();

    middleware.use(request, response, next);
    response.statusCode = 401;
    response.emit('finish');
    response.emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(recordHttpRequest).toHaveBeenCalledOnce();
    expect(recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: '/api/users/:id', statusCode: 401 }),
    );
    expect(httpRequestCompleted).toHaveBeenCalledOnce();
    expect(httpRequestCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: '/api/users/:id', statusCode: 401 }),
    );
    expect(JSON.stringify(httpRequestCompleted.mock.calls)).not.toContain('sensitive');
  });

  it('uses a bounded label for an unmatched route', () => {
    const recordHttpRequest = vi.fn();
    const httpRequestCompleted = vi.fn();
    const middleware = new HttpObservabilityMiddleware(
      { recordHttpRequest } as unknown as MetricsService,
      { httpRequestCompleted } as unknown as JsonLoggerService,
    );
    const response = new EventEmitter() as unknown as Response;
    response.statusCode = 404;

    middleware.use(
      { method: 'GET', originalUrl: '/unknown/private-value' } as Request,
      response,
      vi.fn(),
    );
    response.emit('finish');

    expect(recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'unmatched', statusCode: 404 }),
    );
  });

  it('attaches completion telemetry only once when Nest mounts it twice for an excluded route', () => {
    const recordHttpRequest = vi.fn();
    const httpRequestCompleted = vi.fn();
    const middleware = new HttpObservabilityMiddleware(
      { recordHttpRequest } as unknown as MetricsService,
      { httpRequestCompleted } as unknown as JsonLoggerService,
    );
    const request = {
      baseUrl: '',
      method: 'GET',
      route: { path: '/health/live' },
    } as unknown as Request;
    const response = new EventEmitter() as unknown as Response;
    response.statusCode = 200;
    const next = vi.fn();

    middleware.use(request, response, next);
    middleware.use(request, response, next);
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(2);
    expect(recordHttpRequest).toHaveBeenCalledOnce();
    expect(httpRequestCompleted).toHaveBeenCalledOnce();
  });
});
