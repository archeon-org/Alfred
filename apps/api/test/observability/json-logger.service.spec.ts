import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { JsonLoggerService } from '../../src/observability/json-logger.service';
import type { RequestContextService } from '../../src/observability/request-context.service';

describe('JsonLoggerService', () => {
  it('emits correlated JSON without serializing arbitrary parameter objects', () => {
    const config = {
      getOrThrow: vi.fn(() => 'info'),
    } as unknown as ConfigService;
    const requestContext = {
      current: () => ({
        requestId: 'request-1',
        spanId: 'span-1',
        traceId: 'trace-1',
        traceparent: 'traceparent-1',
      }),
    } as unknown as RequestContextService;
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new JsonLoggerService(config, requestContext);

    logger.log('request complete', { token: 'must-not-leak' }, 'HttpContext');

    const output = String(write.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toMatchObject({
      context: 'HttpContext',
      level: 'info',
      message: 'request complete',
      requestId: 'request-1',
      traceId: 'trace-1',
    });
    expect(output).not.toContain('must-not-leak');
  });

  it('emits HTTP completion fields as first-class JSON attributes', () => {
    const config = { getOrThrow: vi.fn(() => 'info') } as unknown as ConfigService;
    const requestContext = { current: () => undefined } as unknown as RequestContextService;
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new JsonLoggerService(config, requestContext);

    logger.httpRequestCompleted({
      durationMs: 12,
      method: 'GET',
      route: '/health/live',
      statusCode: 200,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      durationMs: 12,
      event: 'http_request_completed',
      method: 'GET',
      route: '/health/live',
      statusCode: 200,
    });
  });

  it('preserves a bounded server stack while removing the exception message', () => {
    const config = { getOrThrow: vi.fn(() => 'info') } as unknown as ConfigService;
    const requestContext = { current: () => undefined } as unknown as RequestContextService;
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new JsonLoggerService(config, requestContext);
    const oversizedStack = [
      'Error: password=database-secret',
      '    at readiness (/srv/alfred/health.ts:10:2)',
      `    at ${'x'.repeat(8_000)} (/srv/alfred/main.ts:20:4)`,
    ].join('\n');

    logger.error('Unhandled API exception', oversizedStack, 'ApiExceptionFilter');

    const record = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      readonly context: string;
      readonly stack: string;
    };
    expect(record.context).toBe('ApiExceptionFilter');
    expect(record.stack).toContain('at readiness (/srv/alfred/health.ts:10:2)');
    expect(record.stack.length).toBeLessThanOrEqual(4_096);
    expect(record.stack).not.toContain('database-secret');
  });
});
