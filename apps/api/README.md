# Alfred API

NestJS 12 HTTP boundary for the Alfred platform. The initial slice contains
only runtime configuration, PostgreSQL connectivity, and operational health
contracts; product endpoints will be added feature by feature.

## HTTP adapter decision

The API uses the Nest Express adapter. Express is the deliberate bootstrap
choice because it gives the most direct, well-supported NestJS + Supertest
integration path and minimizes adapter-specific behavior while the platform's
API and streaming contracts are still evolving. The transport remains behind
Nest abstractions, so Fastify can be evaluated later with representative load
tests instead of being selected speculatively.

## Commands

Run these from the repository root:

```bash
pnpm --filter @alfred/api dev
pnpm --filter @alfred/api build
pnpm --filter @alfred/api test
pnpm --filter @alfred/api test:coverage
pnpm --filter @alfred/api test:e2e
pnpm --filter @alfred/api typecheck
pnpm --filter @alfred/api lint
```

Copy `.env.example` to the repository-level `.env` for local development. Do
not commit real credentials. `/health/live` proves that the HTTP process is
alive without touching PostgreSQL. `/health/ready` proves that PostgreSQL is
reachable and is the endpoint intended for readiness probes.

The production image is built from the repository root because the API consumes
workspace packages:

```bash
docker build --file apps/api/Dockerfile --target production --tag alfred-api .
```

The final image runs as the pre-defined unprivileged `node` user.

## TDD bootstrap state

The tests in `test/` intentionally define the first implementation contracts
before `src/` exists. After dependencies are installed, the RED command is:

```bash
pnpm --filter @alfred/api test
```

It must fail on imports from the not-yet-created configuration, Prisma, health,
bootstrap, and root application modules. That compile-time failure is the RED
gate; production code should only be added in the subsequent GREEN phase.
