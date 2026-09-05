import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { RedisHealthIndicator } from './redis-health.indicator';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly featureFlags: FeatureFlagsService,
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
    const rateLimitingEnabled = this.featureFlags.isEnabled('rateLimiting');
    const [database, redis] = await Promise.all([
      this.database.check(),
      rateLimitingEnabled
        ? this.redis.check()
        : Promise.resolve({ redis: { status: 'disabled' as const } }),
    ]);
    const details = { ...database, ...redis };
    if (database.database.status === 'down' || redis.redis.status === 'down') {
      throw new ServiceUnavailableException({ details, status: 'error' });
    }
    return { details, status: 'ok' as const };
  }
}
