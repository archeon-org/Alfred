# Development Roles

Use these roles as a lightweight operating model for future Alfred work.

## Feature Work

1. `planner` defines scope, tests and rollback notes.
2. `tester` captures the expected failing behavior.
3. `implementer` makes the smallest scoped production change.
4. `reviewer` checks correctness and regressions.
5. `security-reviewer` checks inputs, env handling and containers when relevant.
6. `quality-gate` runs the final verification commands.
7. `memory-keeper` records verified outcomes, limitations and next steps without raw transcripts or hidden reasoning.

## Maintenance Work

Use `clean-code` for boundary drift, duplicated contracts, unclear names and files that
are becoming too broad. Keep findings tied to concrete files and runtime impact.
