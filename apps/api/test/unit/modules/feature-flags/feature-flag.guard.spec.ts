import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { RequiresFeature } from '@api/modules/feature-flags/requires-feature.decorator';

function context(): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => function testHandler() {},
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  it('retains controller requirements when the handler adds a feature', () => {
    @RequiresFeature('agentRuntime')
    class Controller {
      @RequiresFeature('agUiStreaming')
      handle(this: void) {}
    }
    const flags = { isEnabled: vi.fn((name: string) => name === 'agUiStreaming') };
    const guard = new FeatureFlagGuard(new Reflector(), flags as unknown as FeatureFlagsService);
    const requestContext = {
      getClass: () => Controller,
      getHandler: () => Controller.prototype.handle,
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(requestContext)).toThrow(NotFoundException);
  });
  it('allows routes without a feature requirement', () => {
    const reflector = { getAllAndMerge: vi.fn().mockReturnValue([]) };
    const flags = { isEnabled: vi.fn() };
    const guard = new FeatureFlagGuard(
      reflector as unknown as Reflector,
      flags as unknown as FeatureFlagsService,
    );

    expect(guard.canActivate(context())).toBe(true);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('allows an enabled feature and hides a disabled feature', () => {
    const reflector = { getAllAndMerge: vi.fn().mockReturnValue(['googleOAuth']) };
    const flags = { isEnabled: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false) };
    const guard = new FeatureFlagGuard(
      reflector as unknown as Reflector,
      flags as unknown as FeatureFlagsService,
    );

    expect(guard.canActivate(context())).toBe(true);
    expect(() => guard.canActivate(context())).toThrow(NotFoundException);
  });
});
