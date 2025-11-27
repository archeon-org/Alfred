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
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'documents',
      defaultJobOptions: {
        attempts: 1, // No retries - we handle failures ourselves
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
