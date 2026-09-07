import {
  BadRequestException,
  type ArgumentsHost,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { ApiException } from '@api/common/errors/api.exception';

function responseHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('ApiExceptionFilter', () => {
  it('preserves business codes and public client-error details', () => {
    const { host, json, status } = responseHost();
    new ApiExceptionFilter().catch(
      new ApiException(409, 'stale_revision', 'Revision changed.', { revision: 2 }),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'stale_revision',
        message: 'Revision changed.',
        details: { revision: 2 },
      },
    });
  });

  it('keeps the fallback for ordinary HTTP errors', () => {
    const { host, json } = responseHost();
    new ApiExceptionFilter().catch(new NotFoundException(), host);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'HTTP_404', message: 'Not Found' },
    });
  });

  it('hides business server-error messages and details', () => {
    const { host, json } = responseHost();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    new ApiExceptionFilter().catch(
      new ApiException(503, 'storage_unavailable', 'private backend', { secret: 'private' }),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'storage_unavailable', message: 'Internal server error' },
    });
  });

  it('keeps validation details in a stable failure envelope', () => {
    const { host, json, status } = responseHost();
    const filter = new ApiExceptionFilter();

    filter.catch(new BadRequestException(['email must be an email']), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'HTTP_400', message: ['email must be an email'] },
      success: false,
    });
  });

  it('never returns unexpected server exception details to the caller', () => {
    const { host, json, status } = responseHost();
    const filter = new ApiExceptionFilter();
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter.catch(new Error('database password secret-user'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-user');
    expect(json).toHaveBeenCalledWith({
      error: { code: 'HTTP_500', message: 'Internal server error' },
      success: false,
    });
  });

  it('returns bounded readiness statuses without logging an expected dependency outage as unhandled', () => {
    const { host, json, status } = responseHost();
    const filter = new ApiExceptionFilter();
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter.catch(
      new ServiceUnavailableException({
        details: { database: { status: 'up' }, redis: { status: 'down' } },
        status: 'error',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(log).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'HTTP_503',
        details: { database: { status: 'up' }, redis: { status: 'down' } },
        message: 'Internal server error',
      },
      success: false,
    });
  });
});
