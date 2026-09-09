# Local Development Runbook

## Configure the local stack

Generate private local environment files before starting applications or containers:

```bash
pnpm setup:env
```

- The command creates `.env`, `apps/api/.env`, `apps/web/.env` and `apps/agent/.env` with mode `0600`.
- JWT and metrics secrets are generated with cryptographic randomness. `DATABASE_URL` and
  `REDIS_URL` point at the sibling LangGraph platform stack (`langgraph-agent-repo`): loopback URLs
  in `apps/api/.env`, container URLs plus `DATA_NETWORK` in the root `.env`.
- Existing secret values are preserved and their permissions are tightened. The command migrates
  managed feature flags, synchronizes missing Google provider settings from `apps/api/.env` to the
  root `.env`, and adds missing session, proxy and observability defaults.
- Keep `AUTH_COOKIE_SECURE=false`, `DATABASE_SSL=false`, `TRUST_PROXY_HOPS=0` in
  `apps/api/.env` and
  `FEATURE_GOOGLE_OAUTH_ENABLED=false` for the default loopback-only Enterprise profile.
- Google OAuth is intended for external/commercial deployments. If enabled, replace its client ID,
  client secret and callback URL. `GOOGLE_WORKSPACE_DOMAIN` is optional and restricts sign-in only
  when an external deployment deliberately targets one Workspace.

Docker Compose interpolates the root `.env`; `apps/api/.env` is loaded by `pnpm dev:api`. After
editing only `apps/api/.env`, run `pnpm setup:env` so missing Google settings are synchronized to the
root file. For the local Google web client, authorize `http://localhost:5173` as a JavaScript origin
and `http://localhost:3000/api/auth/providers/google/callback` as the redirect URI.

`.env` is ignored by Git. Do not put credentials in `.env.example` or Docker build arguments.

## Feature flags

The generated root and API environments contain one dedicated feature section:

```dotenv
FEATURE_AGENT_RUNTIME_ENABLED=false
FEATURE_AG_UI_STREAMING_ENABLED=false
FEATURE_FILE_UPLOADS_ENABLED=false
FEATURE_GENERATIVE_UI_ENABLED=false
FEATURE_GOOGLE_OAUTH_ENABLED=false
FEATURE_MCP_APPS_ENABLED=false
FEATURE_RATE_LIMITING_ENABLED=true
FEATURE_OPENAPI_ENABLED=true
FEATURE_RUNTIME_MEMORY_ENABLED=false
FEATURE_SKILLS_ENABLED=false
FEATURE_TEAMS_ENABLED=false
```

Flags are read at API startup; restart the API after changing one. A `true` value only unlocks an
implemented capability—it does not install missing infrastructure or credentials. NestJS enforces
route requirements, while React reads only public product flags from `/api/features` and fails
closed if that manifest is malformed or unavailable. `FEATURE_RATE_LIMITING_ENABLED` is a private
operational flag: it defaults on, and disabling it bypasses every throttler without changing the
authentication or authorization path.

Authentication, authorization, validation, same-origin mutation checks and audit controls are
security invariants, not optional feature flags.

## Shared data services

PostgreSQL and Redis are not provisioned by this repository. Start them from the sibling
`langgraph-agent-repo` checkout before any API, migration or Compose command:

```bash
cd ../langgraph-agent-repo && docker compose up -d postgres redis
```

That stack publishes PostgreSQL on `127.0.0.1:5432` (user `postgres`, password `postgres`, database
`langgraph`) and Redis on `127.0.0.1:6379` without authentication. Containers reach the same
services as `postgres` and `redis` on the `langgraph-agent-repo_agent-network` network, which the
root `.env` names in `DATA_NETWORK`.

| Consumer                                 | PostgreSQL                                                              | Redis                      |
| ---------------------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| Host processes (`pnpm dev:api`)          | `postgresql://postgres:postgres@127.0.0.1:5432/langgraph?schema=public` | `redis://127.0.0.1:6379/0` |
| Containers (`migrate`, `api`)            | `postgresql://postgres:postgres@postgres:5432/langgraph?schema=public`  | `redis://redis:6379/0`     |
| Database client (Beekeeper Studio, psql) | `postgresql://postgres:postgres@localhost:5432/langgraph`               | —                          |

The API owns only the `api_`-prefixed tables of the `langgraph` database: `api_users`,
`api_user_identities`, `api_oauth_login_states`, `api_refresh_sessions`, `api_idempotency_keys` and
the TypeORM ledger `api_migrations`. Every other `public` table belongs to the LangGraph runtime;
never migrate, rename or drop those from this repository.

Apply the migration registry from the host when Compose is not used. The migration and drift
scripts read `DATABASE_URL` from the process environment, not from `apps/api/.env`:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/langgraph?schema=public' pnpm --filter @alfred/api migration:run
```

## Start the complete local stack

For frontend work with live updates at `http://localhost:5173`:

```bash
pnpm docker:dev
```

This combines `docker-compose.yml` with `docker-compose.dev.yml` in the same `alfred` project.
The `web` service runs Vite instead of Nginx. React, Tailwind/CSS, public assets, HTML and shared
contract source are mounted read-only from the checkout; Vite updates the browser when they change.
Docker-only polling at a 300 ms interval makes file watching reliable across Docker Desktop's
filesystem bridge. Vite's cache and temporary config bundle live in writable temporary filesystems.
Dependencies stay inside the Linux image; no host `node_modules` or private `.env` file is mounted.
Only the existing loopback port is published. `/api` forwards to `api:3000`, preserving the browser
origin and replacing forwarding headers for the API's single trusted proxy hop.

If the API and data services are already running, update only the frontend:

```bash
pnpm docker:dev:web
pnpm docker:dev:logs
```

`docker:dev:web` rebuilds/recreates only `web`, without restarting databases or rerunning migrations.
Keep using the dev commands while developing; plain `docker:up` switches `web` back to the static
Nginx image. Do not combine the dev overlay with `docker-compose.platform.yml` or expose Vite as a
production server.

| Change                                                            | Required action in Docker development                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| React, styles, mocks, HTML, public assets, shared contract source | Save the file; Vite applies HMR or reloads the page.                                             |
| Mounted Vite/TypeScript config                                    | Vite normally restarts/reloads; rerun `pnpm docker:dev:web` if a config change is not picked up. |
| Dependencies, lockfile, Dockerfile, package metadata              | Run `pnpm docker:dev:web` to rebuild the web image.                                              |
| Root `.env` values passed to `web`                                | Run `pnpm docker:dev:web` to recreate its environment.                                           |
| API or agent source/config                                        | Their source is not mounted; rebuild/recreate the affected service.                              |

`pnpm dev:web` still runs Vite directly on the host and uses the host API proxy settings. Stop the
Docker web service first if the host process must use port 5173.

For the static built-asset workflow:

```bash
pnpm docker:up
```

`docker:up` rebuilds images before starting the detached stack. Its Nginx web image is a source
snapshot: it has no bind mount or hot reload, so edits require a new build. When only runtime container values
such as Google OAuth settings changed, reuse the existing images and recreate the containers
instead:

```bash
pnpm setup:env
pnpm docker:recreate
```

`docker:recreate` runs Compose with `--force-recreate --no-build`: it reloads container environment
values and preserves named volumes, but it does not include source-code changes in existing images.
Because `VITE_API_URL` is a web build argument, changing its same-origin relative path still
requires `pnpm docker:up`; absolute API origins are rejected by the web build.

The startup order is deliberate:

1. The platform PostgreSQL and Redis must already be running; Compose fails fast when the external
   `DATA_NETWORK` network does not exist.
2. `migrate` runs the compiled TypeORM migration registry once against the shared `langgraph`
   database; its first migration installs `citext` when missing.
3. The API starts only after `migrate` exits successfully; Redis readiness is evaluated by the API
   only when rate limiting is enabled.
4. The web container waits for API readiness.

Docker Desktop groups the services under `alfred`: `api`, `web` and `agent` are application
processes and `migrate` is an initialization job whose `Exited (0)` status is the expected
successful state. PostgreSQL and Redis appear under the `langgraph-agent-repo` project. Keep the
`migrate` definition because the next startup uses its ordering; inspect any nonzero exit code
before starting the API.

The local `agent` service runs `langgraph dev`, listens on port `8000` inside the container and is
available at `http://127.0.0.1:2024`. It does not receive an Agent Server licence,
`DATABASE_URI` or `REDIS_URI`.

## Retained volumes from the removed in-repo cluster

Alfred versions before 2026-09-09 provisioned their own PostgreSQL and Redis. Their named volumes
(`alfred_postgres-data` with `alfred_app`, `alfred_blobs`, `alfred_langgraph`, `alfred_test`, and
`alfred_redis-data`) are neither read nor migrated by the current stack. Export anything useful,
then remove them explicitly with `docker volume rm`; `docker compose down` never deletes them.

## Local endpoints

| Service              | URL                                   |
| -------------------- | ------------------------------------- |
| Web                  | `http://localhost:5173`               |
| API readiness        | `http://localhost:3000/health/ready`  |
| Swagger UI           | `http://localhost:3000/api/docs`      |
| OpenAPI JSON         | `http://localhost:3000/api/docs-json` |
| LangGraph dev health | `http://localhost:2024/ok`            |

Swagger UI and its JSON document are mounted only in development and test environments when
`FEATURE_OPENAPI_ENABLED=true`. Set it to false to remove both routes without changing the API.
Production never exposes them, including when the flag is true.

The API receives `REDIS_URL` targeting the platform `redis` service, which has no password on the
local stack. Redis backs the distributed rate limiter and is part of readiness only while
`FEATURE_RATE_LIMITING_ENABLED=true`. When the flag is false, readiness reports Redis as `disabled`
and requests never touch the limiter storage. No Agent Server URL is injected until the AG-UI
invocation adapter exists.

## Proxy and metrics

- `TRUST_PROXY_HOPS` is a non-negative integer, never a broad boolean. Direct host development uses
  `0`; the Compose API uses `1` because Nginx (or Vite in Docker development) is the single trusted hop. Production must set the
  exact ingress chain length.
- Structured JSON logs are enabled with `OBSERVABILITY_LOG_LEVEL`.
- `/metrics` returns 404 unless `OBSERVABILITY_METRICS_ENABLED=true`. When enabled, callers must
  send `Authorization: Bearer <OBSERVABILITY_METRICS_TOKEN>`. Keep that route internal to the
  monitoring network.

## Initial migration compatibility

The provider-neutral foundation migration replaces the earlier uncommitted local-only identity
schema. Do not delete a retained volume automatically. If an old developer volume contains useful
data, export it and plan a data conversion first; otherwise explicitly recreate only that local
Alfred volume. Clean databases and CI apply `CreateIdentityFoundation1788464265141` directly.

`PrefixApiTables1788979000000` renames the tables created by the earlier migrations to their
`api_`-prefixed names, and the ledger itself is now `api_migrations`. A database migrated before
that change still holds a `migrations` ledger: rename it with
`ALTER TABLE "migrations" RENAME TO "api_migrations"` before running the registry, or start from
the fresh shared `langgraph` database.

## Validate configuration

The committed example is intentionally sufficient for static validation:

```bash
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.dev.yml config --quiet
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.platform.yml config --quiet
```

Application gates remain:

```bash
pnpm verify
pnpm agent:lint
pnpm agent:typecheck
pnpm agent:test
```

## Stop without deleting data

```bash
docker compose down
```

This removes Alfred containers and its `app` network but retains named volumes. It never stops the
platform PostgreSQL or Redis, which belong to the `langgraph-agent-repo` project.
