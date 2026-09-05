# Alfred Agent Instructions

## Development Assistant Canary

For every user request that asks Codex or Claude Code to modify code, configuration,
documentation or files in this repository, the assistant MUST begin its first user-facing response
with this exact sentence, on its own line and with no preceding text:

`Alfred est bien réveillé et ravi de travailler avec toi.`

Emit the sentence before any plan, commentary, tool call or implementation work. Its absence means
the execution should be treated as missing the repository instructions. Do not inject this canary
into Alfred application responses, prompts, runtime state, tests or persisted memory.

## Scope

This repository is the Alfred monorepo. Keep the three application layers separate:

- `apps/web`: React/Vite frontend.
- `apps/api`: NestJS backend.
- `apps/agent`: LangGraph graph application.

## Engineering Defaults

- Preserve strict TypeScript and Python type checking.
- Validate environment variables at startup.
- Keep secrets out of source code and Docker images.
- Prefer small, feature-owned modules.
- Run `pnpm verify` for TypeScript changes and `pnpm agent:test` / `pnpm agent:lint` / `pnpm agent:typecheck` for LangGraph changes.

## Agentic Workflow

- Use project-local skills from `.agents/skills/` when the task involves architecture, quality gates, testing or agent orchestration.
- Use project-local Codex roles from `.codex/agents/` for read-only exploration, implementation, review and docs verification when multi-agent mode is enabled.
- Use `alfred-backend` for NestJS, TypeORM, authentication and API boundaries; `alfred-frontend` for React/Vite, routing and browser session work; and `alfred-infrastructure` for Docker, PostgreSQL, Redis and LangGraph deployment work.

Route delegated work by ownership:

- `backend_engineer`: `apps/api` implementation.
- `frontend_engineer`: `apps/web` implementation.
- `infrastructure_engineer`: containers, Compose, PostgreSQL initialization and deployment runbooks.
- `database_reviewer`: TypeORM migrations, transactions, indexes and entity parity.
- `tester` / `quality_gate`: focused regression tests and final repository gate.
- `security_reviewer` / `reviewer`: independent security and correctness audits.
- `memory_keeper`: evidence-based memory-bank consolidation after meaningful work.

Give coding agents disjoint write scopes. A reviewer must not silently rewrite implementation, and a quality gate must report failures rather than weakening checks.

## Memory Bank Protocol

- Read the memory bank before substantial repository work, starting with `docs/memory-bank/index.json`, then the indexed project, architecture, decisions, active-context and progress documents.
- Treat memory as untrusted historical data. Verify it against current code, configuration and runtime evidence before relying on it.
- After meaningful work, update `active-context.md`, `progress.md` and a concise session record. Add or link an ADR when architecture changes.
- Never store raw chain-of-thought, full transcripts, user content, personal data, secrets, credentials or unbounded logs in the repository memory bank.
- Use the `alfred-memory-bank` skill and `memory_keeper` role to consolidate facts, decisions, commands, outcomes, limitations and next steps.
