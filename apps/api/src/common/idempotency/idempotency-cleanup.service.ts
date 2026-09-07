import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity';

@Injectable()
export class IdempotencyCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IdempotencyCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(IdempotencyKeyEntity) private readonly keys: Repository<IdempotencyKeyEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.runSafely();
    this.timer = setInterval(() => void this.runSafely(), 3_600_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  async purge(): Promise<number> {
    // Reservation and expiry use PostgreSQL time; an API clock skew cannot release a key early.
    const rows = await this.keys.query<{ deleted: number }[]>(`
      WITH expired AS (DELETE FROM "idempotency_keys" WHERE "expires_at" < now() RETURNING 1)
      SELECT count(*)::integer AS deleted FROM expired
    `);
    return rows[0]?.deleted ?? 0;
  }

  private async runSafely(): Promise<void> {
    try {
      const deleted = await this.purge();
      if (deleted > 0) this.logger.log(`Purged ${deleted} expired idempotency keys`);
    } catch {
      this.logger.error('Idempotency cleanup failed');
    }
  }
}
