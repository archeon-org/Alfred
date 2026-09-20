# ADR 0005: Environment-Controlled Feature Flags

- Status: Accepted
- Date: 2026-09-03

## Context

Alfred must support different deployment profiles. Enterprise cannot use every commercial integration,
while an external edition may enable Google OAuth and other optional capabilities. Scattered
environment checks or frontend-only conditions would drift and would not protect backend routes.

## Decision

- Optional capabilities are declared in one typed NestJS registry and configured through explicit
  `FEATURE_*_ENABLED=true|false` environment variables.
- Product capability flags default to `false`. Operational safety flags may default to `true` when
  disabling them by accident would reduce protection. Invalid boolean strings fail API startup
  instead of being interpreted as truthy.
- A global feature guard enforces `@RequiresFeature(...)` metadata on controllers and handlers.
  Requirements are cumulative: a handler cannot replace a controller requirement. Disabled routes
  return a generic not-found response.
- `GET /api/features` exposes an immutable, boolean-only public product manifest. It contains no
  operational protection state, secrets, credentials, URLs or internal authorization policy.
- React loads that manifest through a TanStack Query hook and uses typed `FeatureGate` components.
  It fails closed when the manifest is missing, malformed or its revalidation fails; cached enabled
  flags are not exposed after a failed revalidation.
- Backend enforcement remains authoritative. A hidden UI control is not a security boundary.
- Flags are deployment-time values read at process startup; changing one requires a restart or
  rollout. A flag does not replace configuration validation for a capability while that capability
  is enabled.
- Authentication checks, authorization, DTO validation and audit/security logging remain invariants
  and cannot be disabled through feature flags.
- Rate limiting is controlled by `FEATURE_RATE_LIMITING_ENABLED`, defaults to on and bypasses every
  NestJS throttler only when explicitly disabled. When disabled, API readiness no longer depends on
  Redis and reports Redis as `disabled`. This private operational flag is not exposed to React.
- Future external infrastructure adapters, such as object/blob storage, must sit behind a feature
  flag and a local or self-hosted fallback port when product behavior can continue without the
  external adapter.
- Google OAuth is controlled by `FEATURE_GOOGLE_OAUTH_ENABLED`, defaults to off and is intended for
  external/commercial deployments. Enterprise keeps it disabled and can add its own identity provider later.

## Initial Registry

| Public name     | Environment variable              |
| --------------- | --------------------------------- |
| `agentRuntime`  | `FEATURE_AGENT_RUNTIME_ENABLED`   |
| `agUiStreaming` | `FEATURE_AG_UI_STREAMING_ENABLED` |
| `fileUploads`   | `FEATURE_FILE_UPLOADS_ENABLED`    |
| `generativeUi`  | `FEATURE_GENERATIVE_UI_ENABLED`   |
| `googleOAuth`   | `FEATURE_GOOGLE_OAUTH_ENABLED`    |
| `mcpApps`       | `FEATURE_MCP_APPS_ENABLED`        |
| `runtimeMemory` | `FEATURE_RUNTIME_MEMORY_ENABLED`  |
| `skills`        | `FEATURE_SKILLS_ENABLED`          |
| `teams`         | `FEATURE_TEAMS_ENABLED`           |

The server-only operational registry additionally contains `rateLimiting`, configured by
`FEATURE_RATE_LIMITING_ENABLED`, and `openApi`, configured by `FEATURE_OPENAPI_ENABLED` with an
additional production exclusion. Their detailed fallback policy is governed by
[ADR 0010](0010-capability-flags-and-operational-fallbacks.md).

## Consequences

- Environment profiles can enable only approved capabilities without rebuilding the frontend.
- Every new optional feature must add one registry entry, configuration test, backend requirement and
  frontend gate where applicable.
- With Google OAuth disabled, the current scaffold has no alternative interactive login provider.
  Enterprise SSO remains a separate feature implementation rather than a boolean pretending it exists.
- With rate limiting disabled, Redis outage does not remove the API from service, but abuse
  protection is intentionally absent until the flag is re-enabled.
- Runtime percentage rollouts and per-user experiments are out of scope for this environment-only
  mechanism; they would require a durable flag service and evaluation context later.
