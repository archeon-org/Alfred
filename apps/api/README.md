# Alfred API

NestJS HTTP boundary for Alfred. The API owns identity, authorization, application persistence and
the future AG-UI stream gateway; the LangGraph service remains a separate agent runtime.

## Security contract

- Routes are authenticated by default through global feature-flag, access-token, role and
  Redis-backed throttling guards. Controllers opt out explicitly with `@Public()`.
- Google OAuth uses authorization code, PKCE, state and nonce. Provider credentials and provider
  tokens stay server-side. It is an optional external/commercial provider controlled by
  `FEATURE_GOOGLE_OAUTH_ENABLED`; a Workspace domain restriction is optional.
- Access tokens are short-lived JWTs. Opaque refresh tokens are stored only as SHA-256 hashes,
  rotated under a database lock and delivered in an HttpOnly cookie. Access-token lifetime defaults
  to five minutes and cannot be configured above fifteen minutes.
- Refresh and logout additionally enforce the configured browser origin.
- External identities are keyed by `(issuer, subject)` in `user_identities`; verified email alone
  never links accounts.
- Expired, revoked and rotated refresh rows are removed by a configurable cleanup service.
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
`node dist/database/run-migrations.js` in a one-shot, read-only container before starting the API.
The required `citext` extension is provisioned by `postgres-bootstrap`, not by the application
migration user. TypeORM cannot auto-install extensions.
