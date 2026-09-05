import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '@api/observability/metrics.service';

function config(enabled: boolean): ConfigService {
  return {
    getOrThrow: vi.fn(() => enabled),
  } as unknown as ConfigService;
}

describe('MetricsService', () => {
  it('records bounded HTTP labels when metrics are enabled', async () => {
    const service = new MetricsService(config(true));

    service.recordHttpRequest({
      durationSeconds: 0.25,
      method: 'GET',
      route: '/api/users/:id',
      statusCode: 200,
    });

    const payload = await service.render();
    expect(service.contentType()).toContain('text/plain');
    expect(payload).toContain('alfred_api_http_requests_total');
    expect(payload).toContain('method="GET"');
    expect(payload).toContain('route="/api/users/:id"');
    expect(payload).toContain('status_code="200"');
  });

  it('does not record application samples while metrics are disabled', async () => {
    const service = new MetricsService(config(false));

    service.recordHttpRequest({
      durationSeconds: 1,
      method: 'POST',
      route: '/api/private',
      statusCode: 500,
    });

    expect(await service.render()).not.toContain('method="POST"');
  });
});
