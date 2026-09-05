---
name: alfred-feature-delivery
description: Implement or fix Alfred application behavior with boundary-aware TDD across apps/web, apps/api, or apps/agent; use for code changes, not read-only audits.
---

# Alfred Feature Delivery

Keep each change owned by one application whenever possible. The browser calls `apps/api`; durable product data belongs behind the API; agent graphs and LangGraph deployment configuration stay in `apps/agent`.

## Workflow

1. Use the repository knowledge graph to locate the owning module and affected callers. Fall back to text search only when the graph lacks the needed config or literal.
2. Add the smallest test that expresses the missing behavior and run it to capture a genuine failing result.
   Place it in the owning app's external `test` tree and choose `unit`, `integration`, `contract`,
   `architecture` or `e2e` according to the boundary being proved; never add tests under `src`.
3. Implement the minimum production change that makes that test pass. Validate public inputs and environment variables at their boundary; never expose private values through `VITE_` variables.
4. Refactor only after the focused test is green. Preserve immutable data transformations and the three application boundaries.
5. Run the focused app checks, then use `alfred-quality-gate` before declaring the change complete.

For a contract spanning multiple apps, make the HTTP contract explicit in `apps/api` and test both sides. Do not couple the React application directly to agent internals without an architecture decision.

## Role Handoffs

Use the project roles when parallel work adds value: `planner` for scope, `tester` for the RED case, `implementer` for production code, `reviewer` and `security-reviewer` for findings, and `quality-gate` for final evidence. Give each editing role exclusive file ownership.
