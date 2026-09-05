import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { RequestContextMiddleware } from '@api/observability/request-context.middleware';
import { RequestContextService } from '@api/observability/request-context.service';

describe('RequestContextMiddleware', () => {
  it('accepts safe correlation input and emits a child W3C trace context', () => {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    const request = {
      headers: {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'x-request-id': 'gateway-request-123',
      },
    } as unknown as Request;
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const next = vi.fn(() => {
      expect(context.current()).toMatchObject({
        requestId: 'gateway-request-123',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      });
    });

    middleware.use(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'gateway-request-123');
    expect(setHeader).toHaveBeenCalledWith(
      'traceparent',
      expect.stringMatching(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[a-f0-9]{16}-01$/u),
    );
  });

  it('replaces malformed correlation headers instead of reflecting them', () => {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    const request = {
      headers: { traceparent: 'invalid', 'x-request-id': '<script>' },
    } as unknown as Request;
    const setHeader = vi.fn();

    middleware.use(request, { setHeader } as unknown as Response, vi.fn());

    expect(setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(/^[a-f0-9-]{36}$/u),
    );
    expect(setHeader).toHaveBeenCalledWith(
      'traceparent',
      expect.stringMatching(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/u),
    );
  });

  it('initializes one context when Nest mounts it twice for an excluded route', () => {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    const request = { headers: {} } as unknown as Request;
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const run = vi.spyOn(context, 'run');
    const next = vi.fn();

    middleware.use(request, response, next);
    middleware.use(request, response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledOnce();
    expect(setHeader).toHaveBeenCalledTimes(2);
  });
});
