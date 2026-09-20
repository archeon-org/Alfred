import { successEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { z } from 'zod/mini';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiJsonResponse,
  ApiRoute,
  type ApiProblem,
} from '../../common/api-docs/api-docs.decorators';

/** The probes have no web contract: these schemas mirror `HealthService` exactly. */
const healthSummaryEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    service: z.literal('alfred-api'),
    status: z.literal('ok'),
    timestamp: z.iso.datetime(),
  }),
);

const healthLivenessSchema = z.strictObject({ status: z.literal('ok') });

/** One instance per dependency, so each one keeps its own description. */
const up = () => z.strictObject({ status: z.literal('up') });

/** A `200` only: a dependency that is `down` turns the answer into the `503` below. */
const healthReadinessSchema = z.strictObject({
  details: z.strictObject({
    database: up(),
    redis: z.strictObject({ status: z.enum(['up', 'disabled']) }),
    storage: z.optional(up()),
  }),
  status: z.literal('ok'),
});

const PROBE_RULES = `Served at the root of the host, **outside the \`/api\` prefix**. Public: no token is read. Never rate limited, so an orchestrator can poll it freely. Like every answer it carries \`Cache-Control: no-store\`.`;

const notReady = (
  when: string,
  details?: Readonly<Record<string, { readonly status: 'down' | 'up' }>>,
): ApiProblem => ({
  status: 503,
  code: 'HTTP_503',
  message: 'Internal server error',
  when,
  ...(details === undefined ? {} : { details }),
});

export const DocGetHealth = () =>
  applyDecorators(
    ApiRoute(
      'Check that the API process answers',
      `A static answer proving that the process serves HTTP, with the service name and the server clock. It checks **no dependency**: it stays \`200\` while PostgreSQL or Redis is down. Use \`GET /health/ready\` to know whether the API can serve traffic, and \`GET /health/live\` for a bare liveness probe.

${PROBE_RULES} Unlike the two probes, this answer uses the usual \`{ success, data }\` envelope. The route takes no parameter and has no error of its own.`,
    ),
    ApiEnvelopeResponse({
      name: 'HealthSummary',
      description: 'The process is up.',
      contract: healthSummaryEnvelopeSchema,
      describe: {
        'data.service': 'Name of the answering service. Always `alfred-api`.',
        'data.status': 'Always `ok`: an answer means the process is up.',
        'data.timestamp':
          'Clock of the server when it answered (UTC, ISO 8601). Useful to spot clock drift; it says nothing about dependencies.',
      },
      data: { service: 'alfred-api', status: 'ok', timestamp: '2026-09-20T16:48:44.102Z' },
    }),
  );

export const DocCheckLiveness = () =>
  applyDecorators(
    ApiRoute(
      'Probe liveness',
      `Answers \`200\` as long as the process can handle a request. It touches neither PostgreSQL, nor Redis, nor the file storage, so a dependency outage never fails it: wire it to the liveness probe of the orchestrator (restart on failure), and \`GET /health/ready\` to the readiness probe.

${PROBE_RULES} The body is **not enveloped**. The route takes no parameter and has no error of its own.`,
    ),
    ApiJsonResponse({
      name: 'HealthLiveness',
      status: 200,
      description: 'The process is alive.',
      contract: healthLivenessSchema,
      describe: { status: 'Always `ok`.' },
      example: { status: 'ok' },
    }),
  );

export const DocCheckReadiness = () =>
  applyDecorators(
    ApiRoute(
      'Probe readiness',
      `Checks the dependencies the API needs to serve traffic, in parallel, and answers \`200\` when none is down, \`503\` otherwise.

- **database**: a \`SELECT 1\` on PostgreSQL. Always checked.
- **redis**: a \`PING\`, only when rate limiting is switched on for the deployment. When it is off, Redis is not contacted and is reported as \`disabled\`, which does not fail the probe.
- **storage**: a probe of the file storage, only when the \`fileUploads\` capability is on; the entry is absent otherwise. Its result is cached for 30 seconds and a probe gives up after 10 seconds.

${PROBE_RULES} The \`200\` body is **not enveloped**; the \`503\` uses the usual error envelope. No error detail of a dependency (host, user, driver message) is ever returned. The route takes no parameter.`,
    ),
    ApiJsonResponse({
      name: 'HealthReadiness',
      status: 200,
      description: 'Every checked dependency is up: the API can serve traffic.',
      contract: healthReadinessSchema,
      describe: {
        details: 'One entry per dependency, keyed by its name.',
        'details.database': 'PostgreSQL.',
        'details.database.status': 'Always `up` in a `200`.',
        'details.redis': 'Redis, the store of the rate limiter.',
        'details.redis.status':
          '`up`, or `disabled` when rate limiting is off on this deployment and Redis was therefore not contacted.',
        'details.storage':
          'The file storage (local directory or S3-compatible bucket). Present only when the `fileUploads` capability is on.',
        'details.storage.status': 'Always `up` in a `200`; at most 30 seconds old.',
        status: 'Always `ok` in a `200`.',
      },
      example: {
        details: { database: { status: 'up' }, redis: { status: 'up' }, storage: { status: 'up' } },
        status: 'ok',
      },
      examples: {
        withoutFileStorage: {
          summary: 'The `fileUploads` capability is off: no `storage` entry',
          value: { details: { database: { status: 'up' }, redis: { status: 'up' } }, status: 'ok' },
        },
        rateLimitingOff: {
          summary: 'Rate limiting is off: Redis is not contacted and reported as `disabled`',
          value: {
            details: { database: { status: 'up' }, redis: { status: 'disabled' } },
            status: 'ok',
          },
        },
      },
    }),
    ApiErrors(
      notReady(
        'PostgreSQL did not answer. `details` holds the status of every checked dependency, `up` or `down` and nothing else. Keep the instance out of rotation and poll again.',
        { database: { status: 'down' }, redis: { status: 'up' } },
      ),
      notReady('Redis did not answer `PONG` while rate limiting is on.', {
        database: { status: 'up' },
        redis: { status: 'down' },
      }),
      notReady('The file storage cannot be reached while the `fileUploads` capability is on.', {
        database: { status: 'up' },
        redis: { status: 'up' },
        storage: { status: 'down' },
      }),
      notReady(
        'A dependency is down on a deployment where rate limiting is off: `details` is then omitted altogether, because it only ever carries `up` and `down` statuses and Redis would read `disabled`.',
      ),
    ),
  );
