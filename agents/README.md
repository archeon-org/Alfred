# Alfred Agent Workflow

This directory documents the human-facing agent workflow for the repository.
Executable Codex roles live in `.codex/agents`, and reusable project skills live in
`.agents/skills`.

## Default Roles

- `planner`: breaks larger changes into phases and verification points.
- `implementer`: edits code inside the assigned scope.
- `tester`: designs and runs focused tests.
- `reviewer`: reviews correctness, regressions and maintainability.
- `security-reviewer`: checks secrets, public inputs, dependency risk and containers.
- `clean-code`: reviews boundaries, naming and duplication.
- `docs-researcher`: verifies current framework behavior from primary sources.
- `quality-gate`: runs the final repository verification gate.
- `memory-keeper`: verifies and consolidates repository memory and session handoffs.

## Operating Rules

- Keep runtime product code in `apps/web`, `apps/api` or `apps/agent`.
- Keep workflow instructions in `.agents/skills` and role configs in `.codex/agents`.
- Treat the NestJS API as the boundary between the browser and private services.
- Do not commit, push or alter external systems without explicit human approval.
- Verify `docs/memory-bank` against current evidence before using or updating it.
