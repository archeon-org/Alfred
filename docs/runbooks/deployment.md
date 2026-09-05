# Container Deployment Runbook

## Compose scopes

`docker-compose.yml` is the local stack. It uses `apps/agent/Dockerfile.dev`, whose only process is
`langgraph dev`.

`docker-compose.platform.yml` is a production-like overlay for validating the standalone Agent
Server integration. It replaces the agent build with `apps/agent/Dockerfile` and injects:

- `DATABASE_URI`, targeting only `alfred_langgraph`;
- `REDIS_URI`, targeting the dedicated `agent-redis` instance;
- `LANGGRAPH_CLOUD_LICENSE_KEY`, required from the runtime environment.

The schema-owner role `alfred_migrator` owns `alfred_app`, `alfred_blobs` and `alfred_test` and is
used only by migration jobs. The runtime role `alfred_api` receives DML privileges on their current
and future tables but no schema creation right. `alfred_agent` can connect only to
`alfred_langgraph`; cross-connections are revoked. The API and Agent Server also use separate
password-protected Redis instances on separate internal Docker networks. The PostgreSQL databases
still share one local cluster, so they are not independent backup or failure domains.

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

`postgres-bootstrap` first applies the idempotent database/extension prerequisites (`citext` for
`alfred_app` and `alfred_test`, plus the Agent Server extension set on `alfred_langgraph`). TypeORM
extension auto-installation is disabled. This also
supports retained volumes because the official PostgreSQL entrypoint only initializes empty ones.

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

The post-migration `postgres-runtime-grants` job then revokes runtime DML on the TypeORM migration
ledger. The API has `condition: service_completed_successfully` on that job; a failed migration or
ACL convergence prevents API startup.
The job runs as UID/GID `10001`, with a read-only root filesystem, a temporary `/tmp`, all Linux
capabilities dropped and `no-new-privileges` enabled.

Keep `/health/live` and `/health/ready` on the internal probe path of the load balancer or
orchestrator; do not publish them through the user-facing ingress. Both skip request throttling so a
failed Redis limiter cannot make liveness fail. Liveness is process-only; readiness performs the
bounded PostgreSQL and Redis checks.

## Image and process posture

- PostgreSQL, Redis, Node.js, Nginx, Python, uv and LangGraph Agent Server references are pinned by
  digest.
- The API, web, local agent, platform agent and migration job run as non-root users.
- PostgreSQL and Redis use their official entrypoints, which drop privileges for the database
  processes while retaining the initialization behavior their images require.
- The production overlay removes PostgreSQL and Redis host ports and detaches both services from
  `host-access`; only the internal `api-data` and `agent-data` networks remain. Administrative access
  must use an approved bastion, one-shot maintenance container or orchestrator-native tunnel.
- Each service runs one primary process; Compose enables an init process for application services.
- PostgreSQL, Redis, API and agent services have healthchecks. Web retains its image healthcheck.
- Redis persists AOF data with `appendfsync everysec` and uses `noeviction`.

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
- feature flags: every validated `FEATURE_*_ENABLED` switch listed in `.env.example`;
- OAuth: `FEATURE_GOOGLE_OAUTH_ENABLED`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_CALLBACK_URL`, and optional
  `GOOGLE_WORKSPACE_DOMAIN`;
- topology: `WEB_APP_URL`, `REDIS_URL`, `TRUST_PROXY_HOPS`;
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

Compose derives migration, API, Agent Server and Redis URLs from distinct URL-safe passwords. The
API container receives only its DML credential; application containers never receive the
PostgreSQL bootstrap or migration credential.

Only `.env.example` placeholders are committed. Never pass JWT, OAuth, PostgreSQL or licence
secrets as image build arguments or public `VITE_` variables.

Feature flags are deployment-time configuration. Changing one requires an API restart or rollout.
The API is authoritative: hiding a React component is never treated as authorization.

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
unfixed findings, in every built PostgreSQL, API, migration, web and agent image; an exception
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
