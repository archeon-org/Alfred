import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_FEATURE_FLAGS_KEY } from './requires-feature.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import type { FeatureFlagName } from './feature-flags.types';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFeatures = this.reflector.getAllAndOverride<readonly FeatureFlagName[]>(
      REQUIRED_FEATURE_FLAGS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredFeatures === undefined || requiredFeatures.length === 0) return true;
    if (requiredFeatures.every((feature) => this.flags.isEnabled(feature))) return true;

    throw new NotFoundException('Feature is not available');
  }
}
