import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { RedisClientService } from '@api/infrastructure/redis/redis-client.service';
import { RedisThrottlerStorage } from '@api/infrastructure/redis/redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('maps the atomic Redis result to the Nest throttler contract', async () => {
    const redis = { evaluate: vi.fn().mockResolvedValue([3, 42, 0, 0]) };
    const storage = new RedisThrottlerStorage(redis as unknown as RedisClientService);

    await expect(storage.increment('key', 60_000, 120, 60_000, 'default')).resolves.toEqual({
      isBlocked: false,
      timeToBlockExpire: 0,
      timeToExpire: 42,
      totalHits: 3,
    });
    expect(redis.evaluate).toHaveBeenCalledOnce();
  });

  it('fails closed when Redis does not return a valid atomic counter result', async () => {
    const redis = { evaluate: vi.fn().mockResolvedValue('invalid') };
    const storage = new RedisThrottlerStorage(redis as unknown as RedisClientService);

    await expect(storage.increment('key', 60_000, 120, 60_000, 'default')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
