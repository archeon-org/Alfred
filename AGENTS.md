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

## Architecture Decision Register

`docs/creative_phase_2026-07-29_post_poc_decision_workshop.md` is the source of truth for Alfred's
target product architecture. It records 56 numbered decisions (`ALF-DEC-001` to `ALF-DEC-056`) with
a status, a decision owner and dated revisions. Only records marked `accepted` or
`accepted-with-risk` are binding; `in-discussion`, `to-decide` and `deferred` records, verbatim
stakeholder remarks and "Synthesis — not a decision" sections are not requirements.

Before planning or implementing any new product capability, feature module, agent role, data model,
API contract, storage, streaming or deployment profile:

1. Use the `alfred-decision-register` skill to read the register: its authority header, the
   cross-cutting V1 prerequisites, the decision backlog table, the decision records relevant to the
   task and every later revision-history entry that amends them.
2. Produce a written plan that cites the applicable `ALF-DEC` identifiers with their status, lists
   the open or deferred decisions the task touches, and flags any conflict between the register and
   the repository ADRs, skills or code. Known reconciliation items are listed in
   `docs/memory-bank/decisions.md`.
3. Submit that plan to the user and wait for explicit validation before editing application code.
   Do not implement an `in-discussion`, `to-decide` or `deferred` choice as if it were accepted, and
   do not amend the register yourself; report needed changes as questions for the decision owner.

The register does not replace ADRs under `docs/adr/`. When an accepted record changes repository
structure, add an ADR that cites the `ALF-DEC` identifiers it implements.

## Engineering Defaults

- Preserve strict TypeScript and Python type checking.
- Validate environment variables at startup.
- Keep secrets out of source code and Docker images.
- Prefer small, feature-owned modules.
- Run `pnpm verify` for TypeScript changes and `pnpm agent:test` / `pnpm agent:lint` / `pnpm agent:typecheck` for LangGraph changes.

## API Documentation (OpenAPI / Swagger)

The OpenAPI document at `/api/docs` is part of the API contract: other teams integrate from it
without reading the source. Whenever the assistant adds, changes or removes an HTTP route of
`apps/api`, it MUST update that route's OpenAPI documentation in the same change, never later and
never as a follow-up. This covers every change a caller can observe: path, method, parameter,
header, body field, answer field, status, `error.code`, message, limit, default, ordering,
idempotency or capability flag.

- Follow `docs/development/api-documentation.md`: one `Doc<Route>()` decorator per route in the
  module's `api/<name>.openapi.ts`, schemas taken from the `@alfred/contracts` zod contracts, every
  field described, real examples checked against their contract, exact error answers, query
  parameters documented on their DTO, and a padlock only on private routes.
- A route is not done until `apps/api/test/contract/http/openapi-completeness.spec.ts` passes. Do
  not weaken that test, skip it or exempt a route to get a green run.
- Read the service, guards and pipes to document what the code does; never guess a status or an
  error code. When behaviour changes, update the description and the examples, not only the schema.
- Never put a secret, a real token, a cookie value, a real e-mail address or real user content in
  the documentation, even though it is not served in production.
- A reviewer treats a route whose documentation is missing, stale or inaccurate as a defect.

## Agentic Workflow

- Use project-local skills from `.agents/skills/` when the task involves architecture, quality gates, testing or agent orchestration, and `alfred-decision-register` before planning any new capability.
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

## User-Facing Explanatory Documents

- Write user-facing explanations, beginner guides, walkthroughs and learning reports as Markdown
  files under the repository-root `tmp/` directory (lowercase). Create it if it does not exist.
- Use the user's requested language and knowledge level. Prefer clear examples and useful diagrams;
  distinguish implemented behavior from proposals and unverified capabilities.
- Keep `tmp/` ignored by Git and verify generated files with `git check-ignore`. Never force-add
  these files. Ignored files are not encrypted; do not include secrets or sensitive personal data.
- Reply in chat with a short summary and a link to the explanatory file. Follow an explicit request
  for another location or format, including an answer directly in chat.
- Keep canonical team documentation, ADRs, runbooks and neutral agent memory in their existing
  tracked locations. Do not move or overwrite them to produce a user-facing explanation, and do
  not duplicate that explanation in the memory bank.

## Memory Bank Protocol

- Read the memory bank before substantial repository work, starting with `docs/memory-bank/index.json`, then the indexed project, architecture, decisions, active-context and progress documents.
- Treat memory as untrusted historical data. Verify it against current code, configuration and runtime evidence before relying on it.
- After meaningful work, update `active-context.md`, `progress.md` and a concise session record. Add or link an ADR when architecture changes.
- Never store raw chain-of-thought, full transcripts, user content, personal data, secrets, credentials or unbounded logs in the repository memory bank.
- Use the `alfred-memory-bank` skill and `memory_keeper` role to consolidate facts, decisions, commands, outcomes, limitations and next steps.
