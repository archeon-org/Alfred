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

The official standalone server listens on container port `8000`; Compose keeps the local host
contract at `http://127.0.0.1:2024`. PostgreSQL is shared through separately authorized database
roles; Redis and Docker networks are isolated per runtime.

LangChain documents PostgreSQL, Redis, `DATABASE_URI`, `REDIS_URI` and the licence key as standalone
Agent Server prerequisites. Licence validation requires either the contractually approved egress
or the vendor's air-gapped mode; settle that platform decision before calling this production-ready.
See the [standalone server documentation](https://docs.langchain.com/langsmith/deploy-standalone-server).

## Migration gate

`postgres-bootstrap` first applies the idempotent database/extension prerequisites (`citext` only
for `alfred_app` and `alfred_test`). TypeORM extension auto-installation is disabled. This also
supports retained volumes because the official PostgreSQL entrypoint only initializes empty ones.

`migrate` is a one-shot service built from the same production image as the API. It does not need
TypeScript, pnpm or network access at startup. It runs exactly:

```bash
node dist/database/run-migrations.js
```

The API has `condition: service_completed_successfully`; a failed migration prevents API startup.
The job runs as UID/GID `10001`, with a read-only root filesystem, a temporary `/tmp`, all Linux
capabilities dropped and `no-new-privileges` enabled.

Keep `/health/live` and `/health/ready` on the internal probe path of the load balancer or
orchestrator; do not publish them through the user-facing ingress. They remain globally throttled as
defense in depth because readiness performs a PostgreSQL query.

## Image and process posture

- PostgreSQL, Redis, Node.js, Nginx, Python, uv and LangGraph Agent Server references are pinned by
  digest.
- The API, web, local agent, platform agent and migration job run as non-root users.
- PostgreSQL and Redis use their official entrypoints, which drop privileges for the database
  processes while retaining the initialization behavior their images require.
- Each service runs one primary process; Compose enables an init process for application services.
- PostgreSQL, Redis, API and agent services have healthchecks. Web retains its image healthcheck.
- Redis persists AOF data with `appendfsync everysec` and uses `noeviction`.

## Required configuration contract

The API receives the complete current backend contract from Compose:

- JWT: `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`,
  `AUTH_ACCESS_TOKEN_TTL_SECONDS`, `AUTH_REFRESH_TOKEN_TTL_SECONDS`, `AUTH_COOKIE_SECURE`;
- feature flags: every validated `FEATURE_*_ENABLED` switch listed in `.env.example`;
- OAuth: `FEATURE_GOOGLE_OAUTH_ENABLED`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_CALLBACK_URL`, and optional
  `GOOGLE_WORKSPACE_DOMAIN`;
- topology: `WEB_APP_URL`, `REDIS_URL`, `TRUST_PROXY_HOPS`;
- database: `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_SSL`.

The current API has no Agent Server URL because the AG-UI invocation adapter is not implemented.
Do not add a credentialed runtime URL before its service-authentication and principal-handoff
contract is reviewed.

Operational configuration also includes:

- `AUTH_SESSION_CLEANUP_INTERVAL_SECONDS` and `AUTH_SESSION_RETENTION_SECONDS` for bounded refresh
  session retention;
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

## Supply-chain gate

GitHub Actions are pinned to full commit SHAs. The security workflow performs JavaScript/Python
dependency audits, CodeQL analysis, Trivy vulnerability/secret/misconfiguration scanning and
CycloneDX SBOM generation. Dependabot covers npm, Python, GitHub Actions and each Dockerfile
directory. In Enterprise, mirror the actions, package registries, scanner databases and base images into
approved internal services before enabling the same controls without Internet access.

## Validation before delivery

```bash
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.platform.yml config --quiet
pnpm verify
pnpm agent:lint
pnpm agent:typecheck
pnpm agent:test
```

Static Compose validation does not prove that a licence is valid, that production TLS certificates
are trusted, that the approved internal image scanner is green or that the complete user journey
works. Validate those separately in the approved environment.
