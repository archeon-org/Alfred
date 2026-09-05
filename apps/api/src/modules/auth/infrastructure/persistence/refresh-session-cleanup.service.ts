import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, type Repository } from 'typeorm';
import { RefreshSessionEntity } from './entities/refresh-session.entity';

@Injectable()
export class RefreshSessionCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly intervalMs: number;
  private readonly logger = new Logger(RefreshSessionCleanupService.name);
  private readonly retentionMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(RefreshSessionEntity)
    private readonly sessions: Repository<RefreshSessionEntity>,
    config: ConfigService,
  ) {
    this.intervalMs = config.getOrThrow<number>('AUTH_SESSION_CLEANUP_INTERVAL_SECONDS') * 1_000;
    this.retentionMs = config.getOrThrow<number>('AUTH_SESSION_RETENTION_SECONDS') * 1_000;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.runSafely();
    this.timer = setInterval(() => void this.runSafely(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  async purge(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retentionMs);
    const result = await this.sessions.delete({ expiresAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  private async runSafely(): Promise<void> {
    try {
      const deleted = await this.purge();
      if (deleted > 0) this.logger.log(`Purged ${deleted} expired refresh sessions`);
    } catch (error: unknown) {
      this.logger.error(
        'Refresh session cleanup failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
