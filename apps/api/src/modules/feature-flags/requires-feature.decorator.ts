import { SetMetadata } from '@nestjs/common';
import type { FeatureFlagName } from './feature-flags.types';

export const REQUIRED_FEATURE_FLAGS_KEY = 'alfred:required-feature-flags';

export const RequiresFeature = (...features: readonly FeatureFlagName[]) =>
  SetMetadata(REQUIRED_FEATURE_FLAGS_KEY, Object.freeze([...features]));
