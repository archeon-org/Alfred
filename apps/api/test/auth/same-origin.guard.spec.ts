import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { SameOriginGuard } from '../../src/common/guards/same-origin.guard';

function contextWithOrigin(origin?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: origin === undefined ? {} : { origin } }),
    }),
  } as unknown as ExecutionContext;
}

describe('SameOriginGuard', () => {
  const guard = new SameOriginGuard({
    getOrThrow: () => ['http://localhost:5173', 'https://alfred.example.test'],
  } as unknown as ConfigService);

  it('accepts browser mutations only from an allow-listed frontend origin', () => {
    expect(guard.canActivate(contextWithOrigin('https://alfred.example.test'))).toBe(true);
  });

  it('rejects missing and foreign origins', () => {
    expect(() => guard.canActivate(contextWithOrigin())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWithOrigin('https://attacker.example'))).toThrow(
      ForbiddenException,
    );
  });
});
