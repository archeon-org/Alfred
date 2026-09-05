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

  it('classifies database diagnostics without copying identifiers, PII or credentials', () => {
    const config = { getOrThrow: vi.fn(() => 'info') } as unknown as ConfigService;
    const requestContext = { current: () => undefined } as unknown as RequestContextService;
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new JsonLoggerService(config, requestContext);
    const oversizedStack = [
      'DatabaseError: relation "tenant_person@example.test" does not exist Cookie: {"session":"cookie-secret"} Authorization: Basic YWRtaW46cGFzc3dvcmQ= password="database-secret" access_token=\'access-token\' client_secret="oauth-secret"',
      '    at readiness (/srv/alfred/health.ts:10:2)',
      `    at ${'x'.repeat(8_000)} (/srv/alfred/main.ts:20:4)`,
    ].join('\n');

    logger.error('Unhandled API exception', oversizedStack, 'ApiExceptionFilter');

    const record = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      readonly context: string;
      readonly errorMessage: string;
      readonly errorName: string;
      readonly stack: string;
    };
    expect(record.context).toBe('ApiExceptionFilter');
    expect(record.errorName).toBe('DatabaseError');
    expect(record.errorMessage).toBe('database relation does not exist');
    expect(record.errorMessage.length).toBeLessThanOrEqual(1_024);
    expect(record.stack).toContain('at readiness (/srv/alfred/health.ts:10:2)');
    expect(record.stack.length).toBeLessThanOrEqual(4_096);
    expect(JSON.stringify(record)).not.toContain('database-secret');
    expect(JSON.stringify(record)).not.toContain('access-token');
    expect(JSON.stringify(record)).not.toContain('oauth-secret');
    expect(JSON.stringify(record)).not.toContain('person@example.test');
    expect(JSON.stringify(record)).not.toContain('cookie-secret');
    expect(JSON.stringify(record)).not.toContain('YWRtaW46cGFzc3dvcmQ');
  });

  it('uses a closed diagnostic vocabulary for network and unknown errors', () => {
    const config = { getOrThrow: vi.fn(() => 'info') } as unknown as ConfigService;
    const requestContext = { current: () => undefined } as unknown as RequestContextService;
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new JsonLoggerService(config, requestContext);

    logger.error(
      new Error(
        'connect ECONNREFUSED 127.0.0.1:5432 for person@example.test Cookie={"session":"cookie-secret"}',
      ),
    );
    logger.error(
      new Error(
        'unexpected failure for person@example.test Authorization: Basic YWRtaW46cGFzc3dvcmQ= secret="quoted-secret"',
      ),
    );

    const records = write.mock.calls.map(
      ([value]) => JSON.parse(String(value)) as Record<string, unknown>,
    );
    expect(records.map(({ errorMessage }) => errorMessage)).toEqual([
      'connection refused',
      'details redacted',
    ]);
    expect(records.every(({ message }) => message === 'Unhandled application error')).toBe(true);
    expect(JSON.stringify(records)).not.toContain('person@example.test');
    expect(JSON.stringify(records)).not.toContain('cookie-secret');
    expect(JSON.stringify(records)).not.toContain('YWRtaW46cGFzc3dvcmQ');
    expect(JSON.stringify(records)).not.toContain('quoted-secret');
  });
});
