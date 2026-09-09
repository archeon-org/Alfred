# ADR 0010: Capability Flags and Operational Fallbacks

- Status: Accepted
- Date: 2026-09-04

## Context

Alfred needs deployment profiles that can disable optional product and infrastructure capabilities
without breaking unrelated application journeys. The existing public feature manifest is suitable
for browser-visible product capabilities, but operational switches such as rate limiting must not
leak internal protection posture or become frontend concerns. External storage also needs an
explicit simpler backend rather than an unsafe automatic failover that can split data.

## Decision

Feature controls belong to one of four classes:

1. **Public product capability**: defaults off, is enforced by the API and may be exposed as a
   boolean in `/api/features` so React can hide unavailable UI. Public availability is the
   intersection of the environment value and an explicit implementation-readiness registry.
2. **Private operational capability**: remains server-only, has a behavior-preserving no-op or
   passthrough state and defaults to the safer backward-compatible value.
3. **Adapter-backed capability**: uses a domain port and selects one configured adapter at process
   startup. Its disabled or simpler mode must be explicit and durable.
4. **Security or data invariant**: cannot be disabled. Authentication, authorization, DTO
   validation, same-origin mutation protection, identity isolation, refresh-token rotation and
   reuse revocation, migration ownership and basic liveness remain mandatory.

`FEATURE_RATE_LIMITING_ENABLED` is the first private operational flag. It defaults to `true`. When
`true`, all five NestJS throttlers use the shared Redis storage and Redis remains a readiness
dependency. When explicitly `false`, one common throttler predicate bypasses global and
route-specific limits without touching Redis, and readiness reports Redis as `disabled`. The flag
does not enter the browser contract or public feature manifest.

Compose no longer blocks API process startup on Redis health. With rate limiting enabled, the API
healthcheck still remains unready until Redis recovers; with it disabled, unrelated API behavior
can remain available. The base Compose stack still provisions Redis and requires
`REDIS_API_PASSWORD` even when this flag is false; the switch removes the API runtime dependency,
not the infrastructure service or its credential contract.

`FEATURE_OPENAPI_ENABLED` is private and defaults to true for development/test compatibility.
False removes both Swagger UI and JSON without changing API endpoints. Production always disables
documentation regardless of the flag. Optional integration credentials are required only while the
integration is enabled; explicit placeholder credentials for inactive Google OAuth or metrics do
not block startup. Mandatory signing and database credentials remain validated.

Flags are immutable startup snapshots. Restart/recreate the API after changing them. API responses
are not cacheable, and failed browser revalidation exposes disabled flags instead of stale enabled
data. This does not provide real-time rollout propagation across replicas.

Future object storage will keep `fileUploads` as the public product gate and introduce an API-owned
storage port. Local persistent storage is the simple/default adapter; an S3-compatible adapter is
enabled only for an approved deployment. Selection is fixed at startup. Alfred must not silently
switch from S3-compatible storage to local storage after a write failure, because that would split
objects between backends. A backend transition requires dual-read or migration rules before the
configured adapter changes. Local files must live on a persistent volume, never the container's
read-only image filesystem.

## Consequences

- Existing deployments retain rate limiting without adding configuration because the flag defaults
  to `true`.
- Operators can deliberately run without rate limiting and without Redis readiness coupling, while
  accepting that abuse protection is absent.
- Internal operational state is not advertised to unauthenticated browser clients.
- Adding a flag requires documented enabled and disabled semantics, dependencies, observability and
  tests for both states; placeholder flags do not count as implemented capabilities.
- Setting a reserved public flag to `true` in the environment does not expose it to React or unlock
  `@RequiresFeature` routes until its implementation-readiness entry is also enabled.
- External adapters remain Enterprise-approved or self-hosted choices and cannot introduce an implicit
  public-cloud dependency.

## Current Capability Inventory

| Capability                                                     | Current control                                             | Disabled behavior / remaining work                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| API rate limiting                                              | Private `FEATURE_RATE_LIMITING_ENABLED`, default on         | All five buckets bypass storage; Redis readiness is disabled                |
| Prometheus metrics                                             | `OBSERVABILITY_METRICS_ENABLED`, default off                | Collection is a no-op and the endpoint returns 404                          |
| Google OAuth                                                   | Public `googleOAuth`, default off                           | Provider is unavailable; another login adapter is not implemented           |
| AG-UI                                                          | Public `agUiStreaming`, default off                         | Capability route returns 404; invocation/stream adapter is not implemented  |
| Runtime memory                                                 | API manifest plus agent `MemoryContext.memory_enabled`      | Agent opt-out exists; the API flag is not yet connected to graph invocation |
| OpenAPI documentation                                          | Private `FEATURE_OPENAPI_ENABLED` plus production exclusion | Disabled removes UI and JSON; ordinary API endpoints remain available       |
| Uploads, generative UI, MCP apps, skills, teams, agent runtime | Reserved public declarations                                | Environment `true` remains unavailable until an execution path exists       |
| S3-compatible storage                                          | Not implemented                                             | Future local/remote adapters must follow the transition policy above        |

This decision refines the operational semantics in
[ADR 0005](0005-environment-feature-flags.md) without changing its public product-flag contract.

## Amendment 2026-09-09

Compose no longer provisions Redis or requires `REDIS_API_PASSWORD`; `REDIS_URL` targets the
sibling LangGraph platform's Redis. The readiness semantics of `FEATURE_RATE_LIMITING_ENABLED`
are unchanged. See [ADR 0014](0014-shared-platform-data-services.md).
