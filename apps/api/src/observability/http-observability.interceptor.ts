import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { MetricsService } from './metrics.service';
import { JsonLoggerService } from './json-logger.service';

type RoutedRequest = Omit<Request, 'route'> & { route?: { path?: unknown } };

function routeTemplate(request: RoutedRequest): string {
  const path = request.route?.path;
  if (typeof path !== 'string') return 'unmatched';

  return `${request.baseUrl ?? ''}${path}` || '/';
}

@Injectable()
export class HttpObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: JsonLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const startedAt = process.hrtime.bigint();
    const http = context.switchToHttp();
    const request = http.getRequest<RoutedRequest>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      finalize(() => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        const route = routeTemplate(request);
        this.metrics.recordHttpRequest({
          durationSeconds,
          method: request.method,
          route,
          statusCode: response.statusCode,
        });
        this.logger.httpRequestCompleted({
          durationMs: Math.round(durationSeconds * 1_000),
          method: request.method,
          route,
          statusCode: response.statusCode,
        });
      }),
    );
  }
}
