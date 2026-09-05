import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisClientService implements OnApplicationShutdown {
  private readonly client: Redis;
  private connection: Promise<void> | null = null;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', () => undefined);
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return this.client.ping();
  }

  async evaluate(
    script: string,
    keys: readonly string[],
    arguments_: readonly (number | string)[],
  ): Promise<unknown> {
    await this.ensureConnected();
    return this.client.eval(
      script,
      keys.length,
      ...keys,
      ...arguments_.map((value) => String(value)),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }
    this.client.disconnect();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'ready') return;
    if (this.connection !== null) return this.connection;

    this.connection = this.client
      .connect()
      .then(() => undefined)
      .finally(() => {
        this.connection = null;
      });
    return this.connection;
  }
}
