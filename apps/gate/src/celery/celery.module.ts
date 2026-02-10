import { Module, Global, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, Client } from 'celery-node';

// Token for dependency injection
export const CELERY_CLIENT = 'CELERY_CLIENT';

const celeryClientFactory = {
  provide: CELERY_CLIENT,
  useFactory: (configService: ConfigService): Client => {
    const host = configService.get('REDIS_HOST', 'localhost');
    const port = configService.get('REDIS_PORT', 6379);
    const password = configService.get('REDIS_PASSWORD', '');

    const redisUrl = password
      ? `redis://:${password}@${host}:${port}/0`
      : `redis://${host}:${port}/0`;

    const client = createClient(redisUrl, redisUrl);

    return client;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [celeryClientFactory],
  exports: [CELERY_CLIENT],
})
export class CeleryModule implements OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {}

  async onModuleDestroy() {
    // Celery-node client cleanup if needed
    // Note: celery-node handles cleanup internally
  }
}
