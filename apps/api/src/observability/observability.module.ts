import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { JsonLoggerService } from './json-logger.service';
import { HttpObservabilityMiddleware } from './http-observability.middleware';
import { MetricsAccessGuard } from './metrics-access.guard';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  controllers: [MetricsController],
  exports: [JsonLoggerService, MetricsService, RequestContextService],
  providers: [
    HttpObservabilityMiddleware,
    JsonLoggerService,
    MetricsAccessGuard,
    MetricsService,
    RequestContextService,
  ],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, HttpObservabilityMiddleware).forRoutes('*');
  }
}
