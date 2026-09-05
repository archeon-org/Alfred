import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisHealthIndicator } from './redis-health.indicator';

@Module({
  imports: [RedisModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator, HealthService],
})
export class HealthModule {}
