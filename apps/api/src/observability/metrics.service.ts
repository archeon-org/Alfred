import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client';

const HTTP_LABELS = ['method', 'route', 'status_code'] as const;

export interface HttpMetric {
  readonly durationSeconds: number;
  readonly method: string;
  readonly route: string;
  readonly statusCode: number;
}

@Injectable()
export class MetricsService {
  private readonly enabled: boolean;
  private readonly registry = new Registry();
  private readonly requestCount = new Counter({
    help: 'Total number of HTTP requests handled by Alfred API.',
    labelNames: HTTP_LABELS,
    name: 'alfred_api_http_requests_total',
    registers: [this.registry],
  });
  private readonly requestDuration = new Histogram({
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    help: 'HTTP request duration in seconds for Alfred API.',
    labelNames: HTTP_LABELS,
    name: 'alfred_api_http_request_duration_seconds',
    registers: [this.registry],
  });

  constructor(config: ConfigService) {
    this.enabled = config.getOrThrow<boolean>('OBSERVABILITY_METRICS_ENABLED');

    if (this.enabled) {
      collectDefaultMetrics({ prefix: 'alfred_api_', register: this.registry });
    }
  }

  recordHttpRequest(metric: HttpMetric): void {
    if (!this.enabled) return;

    const labels = {
      method: metric.method,
      route: metric.route,
      status_code: String(metric.statusCode),
    };
    this.requestCount.inc(labels);
    this.requestDuration.observe(labels, metric.durationSeconds);
  }

  contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
