---
name: alfred-backend
description: Build or change Alfred NestJS API features, TypeORM persistence, authentication, authorization, validation, or backend tests.
---

# Alfred Backend

Work only in `apps/api` plus directly related contracts and documentation.

## Invariants

- Keep feature ownership under `src/modules/<feature>` and shared HTTP/security primitives under
  `src/common`.
- Routes are private by default through application guards. Mark the smallest intended surface with
  `@Public()`; do not scatter `@UseGuards()` across ordinary protected endpoints.
- Accept concrete DTO classes with `class-validator`. Keep the global whitelist, transformation and
  unknown-field rejection enabled.
- Use TypeORM only. Keep `synchronize: false` and `migrationsRun: false`; schema changes require an
  explicit migration run once before replicas start. Never add Prisma.
- Treat Google OAuth as identity proof only. Do not persist Google tokens. Alfred access tokens stay
  short-lived; opaque refresh tokens are hashed, rotated and revoked by family on reuse. Production
  Google login must be restricted to an explicit Workspace domain.
- Protect cookie-backed mutations with the same-origin guard. Never return secrets or unexpected
  exception details.
- Keep AG-UI transport behind the stream module; do not invent a streaming implementation before its
  contract is requested.
- Structure substantial feature modules as `api`, `application`, `domain` and `infrastructure`.
  Keep controllers/DTOs in `api`, orchestration in `application`, pure rules and ports in `domain`,
  and TypeORM/JWT/remote clients in `infrastructure`; the module file is the composition root.
- Keep every test outside `src`, under `test/unit`, `test/integration`, `test/contract`,
  `test/architecture`, `test/e2e` or `test/support`. Unit paths mirror the source responsibility
  they exercise; E2E uses its dedicated runner configuration.

## Delivery

Start with a behavior or regression test. Run the API lint, typecheck, tests, coverage and build. For
schema changes, validate the migration against a disposable PostgreSQL database and update the
relevant ADR and memory-bank records.
