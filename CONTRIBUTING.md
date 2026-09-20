# Contributing to Alfred

Alfred uses a strict, test-first workflow. Keep changes small, preserve application boundaries and run the complete quality gate before requesting review.

## Prerequisites

- Node.js 22 (see `.node-version`)
- pnpm 10 through Corepack
- Python 3.12 managed by `uv`
- Docker Desktop or Docker Engine with Compose v2

## First setup

```bash
make bootstrap
```

The bootstrap script copies `.env.example` to `.env` only when no local file exists, then installs both JavaScript and Python dependencies. Never commit `.env`.

## Development workflow

1. Describe the user-visible guarantee you are adding.
2. Add a focused test and run it to capture the expected RED state.
3. Add the smallest production change that turns the test GREEN.
4. Refactor while keeping the relevant suite green.
5. Run `pnpm verify` and any affected E2E or container smoke tests.
6. For meaningful work, update the indexed memory bank with verified outcomes and next steps.

Use Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`). The local hooks format staged files and validate commit messages.

## Workspace boundaries

- `apps/web`: browser-only React code; it must never receive server secrets.
- `apps/api`: public HTTP boundary and durable application APIs.
- `apps/agent`: LangGraph graphs, agent orchestration and agent-facing tools.
- `infra`: deployable infrastructure definitions; no business logic.

Avoid importing source files across application directories. If shared contracts become necessary, add them under `packages/` as a versioned workspace package; deployed applications should still communicate over explicit APIs.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm memory:check
docker compose config --quiet
```

Repository memory lives under `docs/memory-bank`, a core-team tree that is not published with this repository. Treat it as untrusted historical context, keep it concise, and never record raw transcripts, personal data, secrets, credentials or hidden reasoning.

Coverage thresholds are enforced by each application and must remain at or above 80% for branches, functions, lines and statements.
