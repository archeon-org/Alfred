import { Global, Module } from '@nestjs/common';
import { RedisClientService } from './redis-client.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  providers: [RedisClientService, RedisThrottlerStorage],
  exports: [RedisClientService, RedisThrottlerStorage],
})
export class RedisModule {}
