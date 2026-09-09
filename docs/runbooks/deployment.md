# Container Deployment Runbook

## Compose scopes

`docker-compose.yml` is the local stack. It uses `apps/agent/Dockerfile.dev`, whose only process is
`langgraph dev`.

`docker-compose.platform.yml` is a production-like overlay for validating the standalone Agent
Server integration. It replaces the agent build with `apps/agent/Dockerfile` and injects:

- `DATABASE_URI` from `AGENT_DATABASE_URI`, which must target a database reserved for this Agent
  Server on the shared PostgreSQL, never the platform's own `langgraph` database;
- `REDIS_URI` from `AGENT_REDIS_URI`, a Redis logical database reserved for this Agent Server;
- `LANGGRAPH_CLOUD_LICENSE_KEY`, required from the runtime environment.

PostgreSQL and Redis are external to this repository: both come from the sibling
`langgraph-agent-repo` platform stack and are reached on the external Docker network named by
`DATA_NETWORK`. The API stores only `api_`-prefixed tables in the shared `langgraph` database, next
to the LangGraph runtime tables ([ADR 0014](../adr/0014-shared-platform-data-services.md)). Local
development uses the platform's `postgres` superuser for migration and runtime connections; a
deployment must inject a dedicated migration role and a DML-only runtime role through
`DATABASE_URL`. Product and runtime data share one cluster, so they are not independent backup or
failure domains.

This overlay is a local integration aid, not a complete production orchestrator. A real deployment
must use the Enterprise-approved internal registry and image scanner, secret injection, TLS, managed
credentials, backups and orchestrator network policy.

## Render and start the Agent Server overlay

Create `.env` from the example, then replace every placeholder. For production semantics:

- provide a new random `AUTH_JWT_SECRET` of at least 32 characters; Compose has no default;
- provide the real `LANGGRAPH_CLOUD_LICENSE_KEY`; Compose has no default;
- set `WEB_APP_URL` and `GOOGLE_OAUTH_CALLBACK_URL` to approved HTTPS origins;
- set every `API_CORS_ORIGINS` entry to an approved HTTPS origin;
- keep the overlay-enforced `AUTH_COOKIE_SECURE=true`;
- set `DATABASE_SSL` and `TRUST_PROXY_HOPS` for the actual database and exact reverse-proxy hop
  count;
- keep `FEATURE_GOOGLE_OAUTH_ENABLED=false` for the Enterprise deployment profile;
- enable Google OAuth only for an approved external/commercial deployment after injecting its client
  credentials and callback URL. Set `GOOGLE_WORKSPACE_DOMAIN` only when tenant restriction is wanted.

Render before starting:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.platform.yml config --quiet
docker compose --env-file .env -f docker-compose.yml -f docker-compose.platform.yml up --build
```

The official standalone server listens on container port `8000`. The production-like overlay does
not publish the API or Agent Server port to the host and does not attach Agent Server to the shared
web/API network. The API runtime, AG-UI and runtime-memory flags are forced off in this overlay
until service authentication and principal handoff are implemented. PostgreSQL is shared through
separately authorized database roles; Redis and Docker networks are isolated per runtime.

LangChain documents PostgreSQL, Redis, `DATABASE_URI`, `REDIS_URI` and the licence key as standalone
Agent Server prerequisites. Licence validation requires either the contractually approved egress
or the vendor's air-gapped mode; settle that platform decision before calling this production-ready.
See the [standalone server documentation](https://docs.langchain.com/langsmith/deploy-standalone-server).

## Migration gate

The first migration installs the only required extension with
`CREATE EXTENSION IF NOT EXISTS "citext"`; the migration credential must be allowed to create that
trusted extension. TypeORM extension auto-installation stays disabled.

`migrate` is a one-shot service built from the same production image as the API. It does not need
TypeScript, pnpm or network access at startup. It runs exactly:

```bash
node dist/database/run-migrations.js
```

The runner uses TypeORM's per-migration transaction mode. Ordinary migrations remain atomic, while
the refresh-session replacement index explicitly runs outside a transaction with
`CREATE INDEX CONCURRENTLY` and a bounded 15-minute statement timeout. If concurrent index creation
fails after PostgreSQL registers an invalid index, a retry verifies the expected table, access
method and key definition, drops only that matching invalid index concurrently, then rebuilds it. A
valid matching index is accepted after a ledger retry; any unexpected object using the reserved
name fails closed. Never replace this with a blocking index build during a live rollout.

The API has `condition: service_completed_successfully` on `migrate`; a failed migration prevents
API startup. The ledger is the `api_migrations` table.
The job runs as UID/GID `10001`, with a read-only root filesystem, a temporary `/tmp`, all Linux
capabilities dropped and `no-new-privileges` enabled.

Rolling back the API image does not undo a migration, and some migrations make the previous
image unusable: `CreateTenants1789000000000` adds `api_users.tenant_id NOT NULL`, which the
previous `UsersService` never fills, so account creation fails on the old code until the
migration is reverted. To roll back below that release, revert the newer migrations first from
the same image, one at a time and newest first, then redeploy the previous API:

```bash
node dist/database/run-migrations.js # forward; reverting uses the TypeORM data source
pnpm --filter @alfred/api migration:revert # repeat once per migration to undo (development)
```

Reverting `CreateTenants` drops `api_conversations`, `api_projects`, the pin column and every
tenant assignment; export anything that must survive before running it. Redeploying only the
previous web application while keeping the schema is the safe partial rollback.

`AddConversationPin1789080000000` adds nullable `api_conversations.pinned_at` and the
project-scoped listing index. Apply it before deploying the API that reads conversation pins,
then deploy the web contract that requires `pinnedAt`. Existing conversations start unpinned.
An application rollback can retain this additive column; reverting the migration erases pin
preferences. See [ADR 0016](../adr/0016-conversation-lifecycle.md).

Keep `/health/live` and `/health/ready` on the internal probe path of the load balancer or
orchestrator; do not publish them through the user-facing ingress. Both skip request throttling so a
failed Redis limiter cannot make liveness fail. Liveness is process-only; readiness performs the
bounded PostgreSQL and Redis checks.

## Image and process posture

- Node.js, Nginx, Python, uv and LangGraph Agent Server references are pinned by digest.
- The API, web, local agent, platform agent and migration job run as non-root users.
- The production overlay removes the API and Agent Server host ports; PostgreSQL and Redis are
  reached only on the external platform network named by `DATA_NETWORK`. Administrative access
  must use an approved bastion, one-shot maintenance container or orchestrator-native tunnel.
- Each service runs one primary process; Compose enables an init process for application services.
- API and agent services have healthchecks. Web retains its image healthcheck.

## Required configuration contract

The API receives the complete current backend contract from Compose:

- JWT: `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`,
  `AUTH_ACCESS_TOKEN_TTL_SECONDS`, `AUTH_REFRESH_TOKEN_TTL_SECONDS`, `AUTH_COOKIE_SECURE`;
- rate limits: `AUTH_IP_RATE_LIMIT_PER_MINUTE` is the high aggregate edge ceiling and must exceed
  the stricter `AUTH_USER_RATE_LIMIT_PER_MINUTE`; Google start, Google callback and refresh also
  have independent IP buckets configured by `AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE`,
  `AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE` and `AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE`;
  size every IP ceiling for the measured enterprise NAT/proxy fan-in and provider/database
  capacity;
- rate-limit mode: `FEATURE_RATE_LIMITING_ENABLED` defaults to `true`; setting it to `false`
  bypasses all global and route-specific throttlers, removes Redis from API readiness and therefore
  deliberately removes abuse protection. `REDIS_URL` remains part of the configuration contract in
  this mode;
- feature flags: every validated `FEATURE_*_ENABLED` switch listed in `.env.example`;
- API documentation: `FEATURE_OPENAPI_ENABLED` defaults on for development/test but production
  always leaves Swagger UI and JSON unavailable;
- OAuth: `FEATURE_GOOGLE_OAUTH_ENABLED`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_CALLBACK_URL`, and optional
  `GOOGLE_WORKSPACE_DOMAIN`;
- topology: `WEB_APP_URL`, `REDIS_URL`, `TRUST_PROXY_HOPS`, and `DATA_NETWORK` for Compose;
- database: `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_SSL`.

The current API has no Agent Server URL because the AG-UI invocation adapter is not implemented.
Do not add a credentialed runtime URL before its service-authentication and principal-handoff
contract is reviewed. At that point, introduce a dedicated API-to-agent control network rather than
reusing the web-facing application network.

Operational configuration also includes:

- `AUTH_SESSION_CLEANUP_INTERVAL_SECONDS` and `AUTH_SESSION_RETENTION_SECONDS` for bounded refresh
  session retention. Retention must be at least `AUTH_REFRESH_TOKEN_TTL_SECONDS` so replay
  tombstones remain enforceable throughout token validity;
- `OBSERVABILITY_LOG_LEVEL` for structured JSON logs;
- `OBSERVABILITY_METRICS_ENABLED` and a dedicated `OBSERVABILITY_METRICS_TOKEN` for the private
  Prometheus endpoint.

Compose passes `DATABASE_URL` and `REDIS_URL` verbatim from the root `.env` to `migrate` and `api`.
Production must give `migrate` and `api` distinct credentials and, while rate limiting is enabled,
a password-protected `REDIS_URL`; the API rejects a password-less Redis URL in production.

Only `.env.example` placeholders are committed. Never pass JWT, OAuth, PostgreSQL or licence
secrets as image build arguments or public `VITE_` variables.

Feature flags are deployment-time configuration. Changing one requires an API restart or rollout.
The API is authoritative: hiding a React component is never treated as authorization. Private
operational flags such as rate limiting are not returned by the public feature manifest.

The current Google start, Google callback and cookie-refresh routes keep the aggregate IP ceiling
and add route-specific IP buckets. Their initial defaults are respectively 300, 600 and 1,200
requests per minute: deliberately higher than consumer-style 10/30 limits so one workstation does
not exhaust a corporate NAT's shared allowance, but substantially below the 6,000/minute aggregate
ceiling. Load-test and tune them from real NAT fan-in and provider/database capacity before enabling
Google commercially; Google remains disabled in the Enterprise profile.

## Supply-chain gate

GitHub Actions are pinned to full commit SHAs. On pushes to `develop`/`main`, pull requests, weekly
schedules and manual runs, the security workflow performs JavaScript/Python dependency audits,
CodeQL analysis, Trivy vulnerability/secret/misconfiguration scanning and CycloneDX SBOM
generation. A pinned Gitleaks CLI image scans the complete Git history from a full checkout without
requiring the commercial organization action. CI also blocks HIGH/CRITICAL findings, including
unfixed findings, in every built API, migration, web and agent image; an exception
requires explicit, time-bounded risk acceptance rather than a silent scanner exclusion. Ephemeral
CI database credentials are masked before entering the job environment. Dependabot covers npm,
Python, GitHub Actions and each Dockerfile directory. In Enterprise, mirror the actions, package
registries, scanner databases and base images into approved internal services before enabling the
same controls without Internet access.

The first local full-history run found the same historical GCP/Firebase API key in two commits.
Three exact documentation examples are fingerprinted in `.gitleaksignore`; the key is deliberately
not ignored. Verify its provider-side restriction or rotate it, then obtain explicit approval before
rewriting published history. Until that remediation is complete, the history job is expected to
remain red and production promotion is blocked.

## Validation before delivery

```bash
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.platform.yml config --quiet
pnpm verify
pnpm --filter @alfred/api schema:check
pnpm agent:lint
pnpm agent:typecheck
pnpm agent:test
```

Static Compose validation does not prove that a licence is valid, that production TLS certificates
are trusted, that the approved internal image scanner is green or that the complete user journey
works. Validate those separately in the approved environment.
