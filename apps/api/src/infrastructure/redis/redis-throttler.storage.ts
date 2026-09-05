import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisClientService } from './redis-client.service';

const INCREMENT_SCRIPT = `
local current_time = redis.call('TIME')
local now = (tonumber(current_time[1]) * 1000) + math.floor(tonumber(current_time[2]) / 1000)
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block_duration = tonumber(ARGV[3])
local hits = tonumber(redis.call('HGET', KEYS[1], 'hits') or '0')
local expires_at = tonumber(redis.call('HGET', KEYS[1], 'expires_at') or '0')
local blocked_until = tonumber(redis.call('HGET', KEYS[1], 'blocked_until') or '0')

if expires_at <= now then
  hits = 0
  expires_at = now + ttl
  blocked_until = 0
end

if blocked_until <= now then
  hits = hits + 1
  if hits > limit then
    blocked_until = now + block_duration
  end
end

redis.call('HSET', KEYS[1], 'hits', hits, 'expires_at', expires_at, 'blocked_until', blocked_until)
redis.call('PEXPIREAT', KEYS[1], math.max(expires_at, blocked_until))

local is_blocked = 0
if blocked_until > now then
  is_blocked = 1
end

local time_to_expire = math.max(0, math.ceil((expires_at - now) / 1000))
local time_to_block_expire = math.max(0, math.ceil((blocked_until - now) / 1000))
return { hits, time_to_expire, is_blocked, time_to_block_expire }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisClientService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    try {
      const result = await this.redis.evaluate(
        INCREMENT_SCRIPT,
        [`alfred:throttle:${throttlerName}:${key}`],
        [ttl, limit, blockDuration],
      );
      if (!this.isCounterResult(result)) throw new Error('Invalid Redis counter result');

      return {
        totalHits: result[0],
        timeToExpire: result[1],
        isBlocked: result[2] === 1,
        timeToBlockExpire: result[3],
      };
    } catch {
      throw new ServiceUnavailableException('Rate limit service is unavailable');
    }
  }

  private isCounterResult(value: unknown): value is [number, number, number, number] {
    return (
      Array.isArray(value) &&
      value.length === 4 &&
      value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    );
  }
}
