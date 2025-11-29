import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DocumentModule } from './document/document.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from '../db/datasource';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(dataSourceOptions as TypeOrmModule),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6378),
          password: configService.get('REDIS_PASSWORD', 'RedisPassword123'),
        },
        settings: {
          // Stalled job detection - checks every 30 seconds
          stalledInterval: 30000,
          // Max times a job can be restarted due to stalling before failing
          maxStalledCount: 2,
          // Lock duration - if a job takes longer than this without heartbeat, it's stalled
          lockDuration: 600000, // 10 minutes - enough for large OCR jobs
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'documents',
      defaultJobOptions: {
        // Allow 2 attempts total (1 initial + 1 retry for stalled jobs)
        attempts: 2,
        // Exponential backoff for retries
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds
        },
        removeOnComplete: true,
        removeOnFail: false, // Keep failed jobs for debugging
      },
    }),
    HealthModule,
    DocumentModule,
    EmbeddingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
