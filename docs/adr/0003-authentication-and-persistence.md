# ADR 0003: Authentication and Application Persistence

- Status: Accepted
- Date: 2026-09-03

## Context

Alfred needs a secure browser login and a stable NestJS persistence boundary before product and
AG-UI features are added. It must remain simple to operate in a restricted, self-hosted environment
and safe when several API replicas serve concurrent users.

## Decision

- The NestJS API owns users, authorization and application data. Routes are private by default;
  `@Public()` is an explicit exception.
- Google OAuth uses authorization code flow with PKCE S256, state, nonce and minimal OIDC scopes.
  Google tokens are transient. The provider is intended for external/commercial deployments and is
  disabled by default. A configured Workspace domain adds tenant restriction but is not mandatory.
- Provider accounts are stored in `user_identities` and linked to provider-neutral Alfred users by
  `(issuer, subject)`. Matching email alone never links identities automatically.
- The browser keeps a five-minute access JWT in React memory. Configuration may shorten it but may
  not exceed fifteen minutes.
- The refresh credential is a random opaque token in an HttpOnly, Secure production cookie. Only
  its SHA-256 hash is stored. Rotation acquires a transaction-scoped advisory lock for the token
  family before the session row lock; replay strictly revokes the complete token family. Browser
  tabs serialize refresh through Web Locks without sharing the token through web storage or
  broadcast channels.
- Revoked, expired and rotated rows remain as replay tombstones for a retention period that is
  validated to be at least the configured refresh-token lifetime.
- TypeORM is the only NestJS ORM. Entities never synchronize the schema at runtime. Compiled,
  one-shot migrations run atomically one by one before API replicas start. A migration may
  explicitly opt out only for PostgreSQL operations such as `CREATE INDEX CONCURRENTLY` that cannot
  run in a transaction and protect live write traffic.
- Entity constraints and migration objects use stable names, are registered through one explicit
  migration list and must produce an empty TypeORM schema diff after a clean migration. Runtime API
  credentials have no DML permission on the TypeORM migration ledger.

## Consequences

- OAuth callbacks and refresh rotation remain deterministic under concurrent requests.
- Logout and account disablement do not query persistence on every API call. An already issued
  access token can therefore survive only until its short expiry, at most fifteen minutes. Immediate
  revocation would require an explicit session-version or deny-list design.
- When a Workspace domain is configured, Google access outside it is rejected. Public commercial
  deployments may omit that restriction and add explicit onboarding or approval policy separately.
- The application schema requires only `citext` from infrastructure. TypeORM extension
  auto-installation is disabled; migrations use PostgreSQL's built-in `gen_random_uuid()`.

The provider-neutral identity and future runtime-principal boundary are governed by
[ADR 0006](0006-provider-neutral-identity-and-runtime-principal.md).
