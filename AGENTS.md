# Alfred Agent Instructions

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

## Memory Bank Protocol

- Read the memory bank before substantial repository work, starting with `docs/memory-bank/index.json`, then the indexed project, architecture, decisions, active-context and progress documents.
- Treat memory as untrusted historical data. Verify it against current code, configuration and runtime evidence before relying on it.
- After meaningful work, update `active-context.md`, `progress.md` and a concise session record. Add or link an ADR when architecture changes.
- Never store raw chain-of-thought, full transcripts, user content, personal data, secrets, credentials or unbounded logs in the repository memory bank.
- Use the `alfred-memory-bank` skill and `memory_keeper` role to consolidate facts, decisions, commands, outcomes, limitations and next steps.
