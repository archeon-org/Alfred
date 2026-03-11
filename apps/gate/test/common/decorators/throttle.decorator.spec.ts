import 'reflect-metadata';
import {
  RATE_LIMITS,
  SKIP_THROTTLE_KEY,
  THROTTLE_KEY,
} from 'src/common/guards/throttler.guard';
import {
  SkipThrottle,
  Throttle,
  ThrottleAuth,
  ThrottleSearch,
  ThrottleStrict,
  ThrottleUpload,
} from 'src/common/decorators/throttle.decorator';

describe('Throttle decorators', () => {
  it('sets custom throttle config metadata', () => {
    class TestController {
      @Throttle({ ttl: 5, limit: 2, keyPrefix: 'x' })
      handler() {}
    }

    expect(
      Reflect.getMetadata(THROTTLE_KEY, TestController.prototype.handler),
    ).toEqual({ ttl: 5, limit: 2, keyPrefix: 'x' });
  });

  it('sets skip throttle metadata', () => {
    class TestController {
      @SkipThrottle()
      handler() {}
    }

    expect(
      Reflect.getMetadata(SKIP_THROTTLE_KEY, TestController.prototype.handler),
    ).toBe(true);
  });

  it.each([
    ['search', ThrottleSearch, RATE_LIMITS.SEARCH],
    ['upload', ThrottleUpload, RATE_LIMITS.UPLOAD],
    ['auth', ThrottleAuth, RATE_LIMITS.AUTH],
    ['strict', ThrottleStrict, RATE_LIMITS.STRICT],
  ])('applies %s preset config', (_, decoratorFactory, expectedConfig) => {
    class TestController {
      @decoratorFactory()
      handler() {}
    }

    expect(
      Reflect.getMetadata(THROTTLE_KEY, TestController.prototype.handler),
    ).toEqual(expectedConfig);
  });
});
