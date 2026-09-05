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
- Optional flags default to `false`. Invalid boolean strings fail API startup instead of being
  interpreted as truthy.
- A global feature guard enforces `@RequiresFeature(...)` metadata on controllers and handlers.
  Disabled routes return a generic not-found response.
- `GET /api/features` exposes an immutable, boolean-only public manifest. It contains no secrets,
  credentials, URLs or internal authorization policy.
- React loads that manifest through a global provider and uses typed `FeatureGate` components. It
  fails closed when the manifest is missing or malformed.
- Backend enforcement remains authoritative. A hidden UI control is not a security boundary.
- Flags are deployment-time values read at process startup; changing one requires a restart or
  rollout. A flag does not replace configuration validation for the capability it enables.
- Authentication checks, authorization, DTO validation, rate limits and audit/security controls are
  invariants and cannot be disabled through feature flags.
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

## Consequences

- Environment profiles can enable only approved capabilities without rebuilding the frontend.
- Every new optional feature must add one registry entry, configuration test, backend requirement and
  frontend gate where applicable.
- With Google OAuth disabled, the current scaffold has no alternative interactive login provider.
  Enterprise SSO remains a separate feature implementation rather than a boolean pretending it exists.
- Runtime percentage rollouts and per-user experiments are out of scope for this environment-only
  mechanism; they would require a durable flag service and evaluation context later.
