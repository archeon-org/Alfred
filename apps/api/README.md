# Alfred API

NestJS HTTP boundary for Alfred. The API owns identity, authorization, application persistence and
the future AG-UI stream gateway; the LangGraph service remains a separate agent runtime.

## Security contract

- Routes are authenticated by default. Global guards run feature-flag, anonymous IP throttling,
  access-token, role and authenticated-user throttling in that order. Controllers opt out of
  authentication explicitly with `@Public()` and health endpoints explicitly skip both throttlers.
- The shared IP ceiling is deliberately higher than the per-user ceiling so corporate NAT traffic
  retains pre-authentication abuse protection without giving one user the entire shared budget.
  OAuth start, OAuth callback and refresh also use independent configurable IP buckets, defaulting
  to 300, 600 and 1,200 requests per minute respectively, so one public flow cannot consume the
  budget of another.
- Google OAuth uses authorization code, PKCE, state and nonce. Provider credentials and provider
  tokens stay server-side. It is an optional external/commercial provider controlled by
  `FEATURE_GOOGLE_OAUTH_ENABLED`; a Workspace domain restriction is optional.
- Access tokens are short-lived JWTs. Opaque refresh tokens are stored only as SHA-256 hashes,
  rotated under a database lock and delivered in an HttpOnly cookie. Access-token lifetime defaults
  to five minutes and cannot be configured above fifteen minutes.
- Refresh and logout additionally enforce the configured browser origin.
- External identities are keyed by `(issuer, subject)` in `user_identities`; verified email alone
  never links accounts.
- Expired, revoked and rotated refresh rows are removed only after a configurable retention period
  that must be at least the complete refresh-token lifetime.
- DTOs cross a strict global `ValidationPipe`; unknown fields are rejected.
- Database schema changes run only through TypeORM migrations. Runtime startup has
  `synchronize: false` and `migrationsRun: false`.

## Commands

Run from the repository root:

```bash
pnpm --filter @alfred/api dev
pnpm --filter @alfred/api build
pnpm --filter @alfred/api lint
pnpm --filter @alfred/api typecheck
pnpm --filter @alfred/api test
pnpm --filter @alfred/api test:coverage
pnpm --filter @alfred/api migration:run
pnpm --filter @alfred/api schema:check
```

Run `pnpm setup:env` for API-specific host development and Compose configuration. Never commit
credentials. Optional capabilities are declared through validated `FEATURE_*_ENABLED` variables.

Operational endpoints are intentionally outside the `/api` prefix:

- `GET /health/live`: process liveness without a database dependency.
- `GET /health/ready`: PostgreSQL and Redis readiness.
- `GET /api/features`: public read-only feature manifest containing booleans only.
- `GET /metrics`: hidden while disabled; otherwise protected by its dedicated bearer token.

The stream boundary is reserved at authenticated `GET /api/stream/capabilities`; no placeholder
SSE implementation is exposed before the AG-UI event and cancellation contract is settled. The
route is unavailable unless `FEATURE_AG_UI_STREAMING_ENABLED=true`.

## Container and migrations

Build from the repository root because the application uses the workspace lockfile:

```bash
docker build --file apps/api/Dockerfile --target runtime --tag alfred-api .
```

The runtime image contains compiled migrations and runs as UID/GID `10001`. Compose executes
`node dist/database/run-migrations.js` in a one-shot, read-only container before a second one-shot
job revokes runtime DML on the TypeORM migration ledger and starts the API.
Migrations run atomically one at a time. A migration may explicitly opt out when PostgreSQL requires
an operation outside a transaction; the refresh-session replacement index uses
`CREATE INDEX CONCURRENTLY` with a bounded 15-minute statement timeout. It disables the connection's
short runtime `lock_timeout` only for the concurrent index operation, then resets both settings in
`finally` blocks. A retry removes only a matching invalid index left by an interrupted concurrent
build; a valid matching index is accepted, while an unexpected index using the reserved name fails
closed.
The required `citext` extension is provisioned by `postgres-bootstrap`, not by the application
migration user. TypeORM cannot auto-install extensions.
