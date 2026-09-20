import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ApiErrors, ApiRoute } from '../common/api-docs/api-docs.decorators';

/** The exact `Content-Type` of the answer: the Prometheus text exposition format 0.0.4. */
const PROMETHEUS_TEXT = 'text/plain; version=0.0.4; charset=utf-8';

const labels = 'method="GET",route="/api/users/me",status_code="200"';

/** Captured from the registry, shortened: some histogram buckets and most runtime families. */
const SCRAPE_EXAMPLE = `# HELP alfred_api_http_requests_total Total number of HTTP requests handled by Alfred API.
# TYPE alfred_api_http_requests_total counter
alfred_api_http_requests_total{${labels}} 42
alfred_api_http_requests_total{method="GET",route="/health/ready",status_code="503"} 1

# HELP alfred_api_http_request_duration_seconds HTTP request duration in seconds for Alfred API.
# TYPE alfred_api_http_request_duration_seconds histogram
alfred_api_http_request_duration_seconds_bucket{le="0.005",${labels}} 3
alfred_api_http_request_duration_seconds_bucket{le="0.01",${labels}} 17
alfred_api_http_request_duration_seconds_bucket{le="0.025",${labels}} 40
alfred_api_http_request_duration_seconds_bucket{le="10",${labels}} 42
alfred_api_http_request_duration_seconds_bucket{le="+Inf",${labels}} 42
alfred_api_http_request_duration_seconds_sum{${labels}} 0.504
alfred_api_http_request_duration_seconds_count{${labels}} 42

# HELP alfred_api_process_resident_memory_bytes Resident memory size in bytes.
# TYPE alfred_api_process_resident_memory_bytes gauge
alfred_api_process_resident_memory_bytes 148570112

# HELP alfred_api_nodejs_eventloop_lag_seconds Lag of event loop in seconds.
# TYPE alfred_api_nodejs_eventloop_lag_seconds gauge
alfred_api_nodejs_eventloop_lag_seconds 0.0021
`;

export const DocScrapeMetrics = () =>
  applyDecorators(
    ApiRoute(
      'Scrape the Prometheus metrics',
      `The metrics of this API process in the Prometheus text exposition format, for a Prometheus-compatible scraper. Served at \`/metrics\`, **outside the \`/api\` prefix**, as \`${PROMETHEUS_TEXT}\` with \`Cache-Control: no-store\`. Never rate limited.

**Access.** The route has no padlock because it does not accept a user session: an Alfred access token answers \`401\` here. It needs the dedicated **scrape token** of the deployment (\`OBSERVABILITY_METRICS_TOKEN\`, at least 32 characters) as \`Authorization: Bearer <scrape token>\`, compared in constant time. Swagger UI cannot send an \`Authorization\` header declared as a parameter: call the route with the scraper or with \`curl\`.

**Switch.** Metrics are off by default (\`OBSERVABILITY_METRICS_ENABLED\`). While off, the route answers \`404\` before it even looks at the token, and nothing is recorded.

**Content.** Every name starts with \`alfred_api_\`:
- \`alfred_api_http_requests_total\` (counter) and \`alfred_api_http_request_duration_seconds\` (histogram, buckets from 5 ms to 10 s), labelled with \`method\`, \`route\` and \`status_code\`. \`route\` is the route template (\`/api/skills/:id\`), never the requested address, so no identifier or query string reaches a label; \`unmatched\` stands for a request that matched no route. A request is counted when its answer is fully sent, whatever its status.
- The default process and Node.js runtime families: CPU, memory, event-loop lag, heap spaces, garbage collection, active handles, Node.js version.

Values are those of **this process** since it started; they reset on restart and are not shared between instances.`,
    ),
    ApiHeader({
      name: 'Authorization',
      required: true,
      description:
        'The scrape token of the deployment, as `Bearer <scrape token>`: the scheme `Bearer`, one space, then the exact value of `OBSERVABILITY_METRICS_TOKEN`. This is not a user access token. Keep it in the secret store of the scraper.',
      schema: { type: 'string', pattern: '^Bearer .+$', example: 'Bearer <scrape token>' },
    }),
    ApiResponse({
      status: 200,
      description:
        'The current metrics, one family after the other: `# HELP`, `# TYPE`, then one line per label set.',
      content: {
        [PROMETHEUS_TEXT]: {
          schema: {
            type: 'string',
            description: 'Prometheus text exposition format, version 0.0.4, UTF-8.',
          },
          example: SCRAPE_EXAMPLE,
        },
      },
    }),
    ApiErrors(
      {
        status: 401,
        code: 'HTTP_401',
        message: 'Unauthorized',
        when: 'No `Authorization` header, a scheme other than `Bearer`, or a value that is not the scrape token (a user access token included). Fix the scraper configuration; retrying does not help.',
      },
      {
        status: 404,
        code: 'HTTP_404',
        message: 'Not Found',
        when: 'Metrics are switched off on this deployment (`OBSERVABILITY_METRICS_ENABLED`). Answered whatever the token, so the route does not reveal itself. Do not retry.',
      },
    ),
  );
