import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';

function context(): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => function testHandler() {},
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  it('allows routes without a feature requirement', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const flags = { isEnabled: vi.fn() };
    const guard = new FeatureFlagGuard(
      reflector as unknown as Reflector,
      flags as unknown as FeatureFlagsService,
    );

    expect(guard.canActivate(context())).toBe(true);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('allows an enabled feature and hides a disabled feature', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['googleOAuth']) };
    const flags = { isEnabled: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false) };
    const guard = new FeatureFlagGuard(
      reflector as unknown as Reflector,
      flags as unknown as FeatureFlagsService,
    );

    expect(guard.canActivate(context())).toBe(true);
    expect(() => guard.canActivate(context())).toThrow(NotFoundException);
  });
});
