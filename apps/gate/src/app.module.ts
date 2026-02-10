import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { dataSourceOptions } from 'db/datasource';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { UserTypeGuard } from './auth/guards/user-type.guard';
import { ThrottlerGuard } from './common/guards/throttler.guard';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { MetricsController } from './common/controllers/metrics.controller';
import { HealthModule } from './health/health.module';
import { DocumentModule } from './document/document.module';
import { CategoryModule } from './category/category.module';
import { TagModule } from './tag/tag.module';
import { TemplateModule } from './template/template.module';
import { NotificationModule } from './notification/notification.module';
import { CeleryModule } from './celery/celery.module';
import { QueueModule } from './queue/queue.module';
import { SearchModule } from './search/search.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AdminModule } from './admin/admin.module';
import { QuestionModule } from './question/question.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
      controller: MetricsController,
    }),
    ScheduleModule.forRoot(),
    CeleryModule,
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
    QuestionModule,
  ],
  providers: [
    // Prometheus metrics
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
    }),
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    // Metrics interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    // Rate limiting guard (applied first)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JWT authentication guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // User type authorization guard
    {
      provide: APP_GUARD,
      useClass: UserTypeGuard,
    },
  ],
})
export class AppModule {}
