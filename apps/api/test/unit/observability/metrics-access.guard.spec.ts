import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { MetricsAccessGuard } from '@api/observability/metrics-access.guard';

function config(enabled: boolean): ConfigService {
  const values: Readonly<Record<string, unknown>> = {
    OBSERVABILITY_METRICS_ENABLED: enabled,
    OBSERVABILITY_METRICS_TOKEN: 'metrics-only-secret-that-is-longer-than-32-characters',
  };
  return {
    get: vi.fn((key: string) => values[key]),
    getOrThrow: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function context(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

describe('MetricsAccessGuard', () => {
  it('hides the endpoint when metrics are disabled', () => {
    const guard = new MetricsAccessGuard(config(false));

    expect(() => guard.canActivate(context())).toThrow(NotFoundException);
  });

  it('accepts only the dedicated metrics bearer token', () => {
    const guard = new MetricsAccessGuard(config(true));

    expect(
      guard.canActivate(context('Bearer metrics-only-secret-that-is-longer-than-32-characters')),
    ).toBe(true);
    expect(() => guard.canActivate(context('Bearer wrong-token'))).toThrow(UnauthorizedException);
  });
});
