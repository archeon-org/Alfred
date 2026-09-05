# Local Development Runbook

## Configure the local stack

Generate private local environment files before starting applications or containers:

```bash
pnpm setup:env
```

- The command creates `.env`, `apps/api/.env`, `apps/web/.env` and `apps/agent/.env` with mode `0600`.
- PostgreSQL, Redis and JWT secrets are generated independently with cryptographic randomness.
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

1. PostgreSQL becomes reachable.
2. `postgres-bootstrap` idempotently creates/configures the four logical databases, including on
   a retained volume created by an older Alfred version. Only `alfred_app` and `alfred_test`
   receive the required `citext` extension.
3. `migrate` runs the compiled TypeORM migration registry once with the schema-owner role.
4. `postgres-runtime-grants` revokes API-runtime DML on the TypeORM migration ledger.
5. The API starts only after both PostgreSQL one-shot jobs exit successfully; Redis readiness is
   evaluated by the API only when rate limiting is enabled.
6. The web container waits for API readiness.

Docker Desktop groups the services under `alfred`. `postgres` and `redis` are persistent data
services; `api`, `web` and `agent` are application processes. `postgres-bootstrap`, `migrate` and
`postgres-runtime-grants` are initialization jobs, not additional PostgreSQL servers. An
`Exited (0)` status is their expected successful state. Keep these service definitions because the
next startup uses their ordering; inspect any nonzero exit code before starting the API.

The local `agent` service runs `langgraph dev`, listens on port `8000` inside the container and is
available at `http://127.0.0.1:2024`. It does not receive an Agent Server licence,
`DATABASE_URI` or `REDIS_URI`.

## Start only data services

For applications running directly on the host:

```bash
docker compose --env-file .env up -d postgres postgres-bootstrap redis
```

PostgreSQL and the API Redis publish only on `127.0.0.1`. Containers reach them through
`api-data`; the production-like Agent Server uses a different `agent-data` network and a separate
Redis instance. Named volumes are persistent:

These loopback publications exist only in the base local-development Compose file. The production
overlay resets both data-service port lists and removes `host-access`, leaving PostgreSQL and Redis
reachable only through their internal Docker networks.

- `postgres-data` contains `alfred_app`, `alfred_blobs`, `alfred_langgraph` and `alfred_test`;
- `redis-data` contains the Redis append-only file, flushed with `appendfsync everysec`.

The official PostgreSQL entrypoint runs initialization scripts only for an empty volume. Alfred's
one-shot `postgres-bootstrap` service reruns those same idempotent scripts after every database
startup, so an older healthy volume is upgraded without deleting it. Inspect and back up material
data before any explicit volume recreation. Never use `docker compose down --volumes` as a routine
troubleshooting step.

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

The API receives an authenticated Redis URL targeting the `redis` service. Redis backs the
distributed rate limiter and is part of readiness only while `FEATURE_RATE_LIMITING_ENABLED=true`.
When the flag is false, readiness reports Redis as `disabled` and requests never touch the limiter
storage. No Agent Server URL is injected until the AG-UI invocation adapter exists.

Disabling the limiter does not remove Redis from Compose: the base stack still provisions the
service and requires `REDIS_API_PASSWORD`. Keep its generated credential configured.

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

This removes containers and networks but retains named volumes.
