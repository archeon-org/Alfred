import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { JsonLoggerService } from './json-logger.service';
import { MetricsService } from './metrics.service';

const HTTP_OBSERVABILITY_ATTACHED = Symbol('http-observability-attached');

type RoutedRequest = Omit<Request, 'route'> & {
  [HTTP_OBSERVABILITY_ATTACHED]?: true;
  route?: { path?: unknown };
};

function routeTemplate(request: RoutedRequest): string {
  const path = request.route?.path;
  if (typeof path !== 'string') return 'unmatched';

  return `${request.baseUrl ?? ''}${path}` || '/';
}

@Injectable()
export class HttpObservabilityMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: JsonLoggerService,
  ) {}

  use(request: RoutedRequest, response: Response, next: NextFunction): void {
    if (request[HTTP_OBSERVABILITY_ATTACHED] === true) {
      next();
      return;
    }
    request[HTTP_OBSERVABILITY_ATTACHED] = true;
    const startedAt = process.hrtime.bigint();

    response.once('finish', () => {
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
    });

    next();
  }
}
