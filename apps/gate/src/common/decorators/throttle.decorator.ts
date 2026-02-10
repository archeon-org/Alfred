import { SetMetadata } from '@nestjs/common';
import {
  RateLimitConfig,
  THROTTLE_KEY,
  SKIP_THROTTLE_KEY,
  RATE_LIMITS,
} from '../guards/throttler.guard';

export const Throttle = (config: RateLimitConfig) =>
  SetMetadata(THROTTLE_KEY, config);

export const SkipThrottle = () => SetMetadata(SKIP_THROTTLE_KEY, true);

export const ThrottleSearch = () => Throttle(RATE_LIMITS.SEARCH);

export const ThrottleUpload = () => Throttle(RATE_LIMITS.UPLOAD);

export const ThrottleAuth = () => Throttle(RATE_LIMITS.AUTH);

export const ThrottleStrict = () => Throttle(RATE_LIMITS.STRICT);
