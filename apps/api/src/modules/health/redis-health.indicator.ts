import { Injectable } from '@nestjs/common';
import { RedisClientService } from '../../infrastructure/redis/redis-client.service';

export interface RedisHealth {
  readonly redis: { readonly status: 'down' | 'up' };
}

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly redis: RedisClientService) {}

  async check(): Promise<RedisHealth> {
    try {
      const response = await this.redis.ping();
      return { redis: { status: response === 'PONG' ? 'up' : 'down' } };
    } catch {
      return { redis: { status: 'down' } };
    }
  }
}
