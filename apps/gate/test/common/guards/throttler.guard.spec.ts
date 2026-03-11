import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMITS,
  ThrottlerGuard,
  THROTTLE_KEY,
} from 'src/common/guards/throttler.guard';

describe('ThrottlerGuard', () => {
  const createGuard = () => {
    const reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;

    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    return {
      guard: new ThrottlerGuard(reflector, configService),
      reflector: reflector as any,
    };
  };

  const createContext = (request: any, response: any = { header: jest.fn() }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    }) as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips throttling when skip metadata is enabled', async () => {
    const { guard, reflector } = createGuard();
    reflector.getAllAndOverride.mockReturnValueOnce(true);

    await expect(
      guard.canActivate(createContext({ headers: {}, socket: {} })),
    ).resolves.toBe(true);
  });

  it('applies default limits and sets response headers', async () => {
    const { guard, reflector } = createGuard();
    const response = { header: jest.fn() };

    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);

    jest.spyOn(guard as any, 'checkRateLimit').mockResolvedValue({
      current: 1,
      remaining: 99,
      resetTime: 1234,
    });

    const request = {
      user: { id: 'user-1' },
      headers: {},
      socket: {},
      ip: '127.0.0.1',
    };

    await expect(
      guard.canActivate(createContext(request, response)),
    ).resolves.toBe(true);

    expect(response.header).toHaveBeenCalledWith(
      'X-RateLimit-Limit',
      RATE_LIMITS.STANDARD.limit.toString(),
    );
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Reset', '1234');
  });

  it('throws 429 when request exceeds limit', async () => {
    const { guard, reflector } = createGuard();
    const response = { header: jest.fn() };
    const customConfig = { ttl: 10, limit: 2, keyPrefix: 'test' };

    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(customConfig);

    jest.spyOn(guard as any, 'checkRateLimit').mockResolvedValue({
      current: 3,
      remaining: 0,
      resetTime: 999,
    });

    const request = {
      headers: {},
      socket: {},
      ip: '127.0.0.1',
    };

    await expect(
      guard.canActivate(createContext(request, response)),
    ).rejects.toBeInstanceOf(HttpException);
    expect(response.header).toHaveBeenCalledWith('Retry-After', '10');
  });

  it('fails open when backend limiter throws non-http error', async () => {
    const { guard, reflector } = createGuard();
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);

    jest
      .spyOn(guard as any, 'checkRateLimit')
      .mockRejectedValue(new Error('limiter unavailable'));

    const request = {
      headers: {},
      socket: {},
      ip: '127.0.0.1',
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('uses user id in generated key when authenticated user exists', () => {
    const { guard } = createGuard();
    const key = (guard as any).generateKey(
      { user: { id: 'abc' }, headers: {}, socket: {}, ip: '10.0.0.1' },
      'rl',
    );
    expect(key).toBe('rl:user:abc');
  });

  it('extracts client ip from x-forwarded-for and socket fallback', () => {
    const { guard } = createGuard();

    expect(
      (guard as any).getClientIp({
        headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
        socket: {},
      }),
    ).toBe('203.0.113.10');

    expect(
      (guard as any).getClientIp({
        headers: { 'x-forwarded-for': ['198.51.100.12'] },
        socket: {},
      }),
    ).toBe('198.51.100.12');

    expect(
      (guard as any).getClientIp({
        headers: {},
        ip: '',
        socket: { remoteAddress: '192.0.2.7' },
      }),
    ).toBe('192.0.2.7');
  });

  it('uses redis branch and sets expiry only on first increment', async () => {
    const { guard } = createGuard();
    const redis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    (guard as any).redis = redis;

    const result = await (guard as any).checkRateLimit(
      'key',
      RATE_LIMITS.STANDARD,
    );

    expect(result.current).toBe(1);
    expect(redis.incr).toHaveBeenCalled();
    expect(redis.expire).toHaveBeenCalled();
  });

  it('cleans up in-memory store when it grows too large', () => {
    const { guard } = createGuard();
    const now = Date.now();
    const store = new Map<string, { count: number; resetAt: number }>();

    for (let i = 0; i < 10001; i += 1) {
      store.set(`expired-${i}`, { count: 1, resetAt: now - 1000 });
    }

    (guard as any).inMemoryStore = store;
    const cleanupSpy = jest.spyOn(guard as any, 'cleanupMemoryStore');

    const result = (guard as any).checkRateLimitMemory('fresh-key', {
      ttl: 60,
      limit: 3,
      keyPrefix: 'x',
    });

    expect(cleanupSpy).toHaveBeenCalled();
    expect(result.current).toBe(1);
  });

  it('respects method-level custom throttle metadata key', async () => {
    const { guard, reflector } = createGuard();
    const response = { header: jest.fn() };

    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === 'skipThrottle') {
        return false;
      }
      if (key === THROTTLE_KEY) {
        return { ttl: 30, limit: 7, keyPrefix: 'custom' };
      }
      return undefined;
    });

    const checkSpy = jest
      .spyOn(guard as any, 'checkRateLimit')
      .mockResolvedValue({
        current: 1,
        remaining: 6,
        resetTime: 777,
      });

    const request = {
      headers: {},
      socket: {},
      ip: '127.0.0.1',
    };

    await expect(
      guard.canActivate(createContext(request, response)),
    ).resolves.toBe(true);
    expect(checkSpy).toHaveBeenCalledWith(
      expect.stringContaining('custom'),
      expect.objectContaining({ limit: 7, ttl: 30 }),
    );
  });
});
