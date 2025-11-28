import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { dataSourceOptions } from 'db/datasource';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { UserTypeGuard } from './auth/guards/user-type.guard';
import { HealthModule } from './health/health.module';
import { DocumentModule } from './document/document.module';
import { CategoryModule } from './category/category.module';
import { TagModule } from './tag/tag.module';
import { TemplateModule } from './template/template.module';
import { NotificationModule } from './notification/notification.module';
import { BullModule } from '@nestjs/bull';
import { QueueModule } from './queue/queue.module';
import { SearchModule } from './search/search.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6378),
          password: configService.get('REDIS_PASSWORD', 'RedisPassword123'),
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRoot(dataSourceOptions as TypeOrmModule),
    UserModule,
    AuthModule,
    HealthModule,
    DocumentModule,
    CategoryModule,
    TagModule,
    TemplateModule,
    QueueModule,
    NotificationModule,
    SearchModule,
    SubscriptionModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserTypeGuard,
    },
  ],
})
export class AppModule {}
