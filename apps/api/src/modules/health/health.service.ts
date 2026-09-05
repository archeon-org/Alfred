import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { RedisHealthIndicator } from './redis-health.indicator';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  getHealth() {
    return {
      service: 'alfred-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  checkLiveness(): Promise<{ readonly status: 'ok' }> {
    return Promise.resolve({ status: 'ok' as const });
  }

  async checkReadiness() {
    const [database, redis] = await Promise.all([this.database.check(), this.redis.check()]);
    const details = { ...database, ...redis };
    if (database.database.status === 'down' || redis.redis.status === 'down') {
      throw new ServiceUnavailableException({ details, status: 'error' });
    }
    return { details, status: 'ok' as const };
  }
}
