import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { FilesStorageModule } from '../files/files-storage.module';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisHealthIndicator } from './redis-health.indicator';

@Module({
  imports: [RedisModule, FilesStorageModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator, HealthService],
})
export class HealthModule {}
