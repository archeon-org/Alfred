import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Counter, Histogram } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly requestCounter: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly requestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const path = this.normalizePath(request.route?.path || request.path);
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const duration = (Date.now() - startTime) / 1000;

          this.requestCounter.inc({
            method,
            path,
            status: this.getStatusCategory(statusCode),
          });

          this.requestDuration.observe({ method, path }, duration);
        },
        error: (error) => {
          const statusCode = error.status || 500;
          const duration = (Date.now() - startTime) / 1000;

          this.requestCounter.inc({
            method,
            path,
            status: this.getStatusCategory(statusCode),
          });

          this.requestDuration.observe({ method, path }, duration);
        },
      }),
    );
  }

  private normalizePath(path: string): string {
    // Remove query params and normalize UUIDs/IDs to placeholders
    return path
      .replace(/\?.*$/, '')
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      )
      .replace(/\/\d+/g, '/:id');
  }

  private getStatusCategory(statusCode: number): string {
    if (statusCode < 200) return '1xx';
    if (statusCode < 300) return '2xx';
    if (statusCode < 400) return '3xx';
    if (statusCode < 500) return '4xx';
    return '5xx';
  }
}
