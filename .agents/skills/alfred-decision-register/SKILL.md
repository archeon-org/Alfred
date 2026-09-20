---
name: alfred-decision-register
description: Consult the Alfred architecture decision register (post-POC creative phase workshop) and produce a decision-cited plan for user validation before implementing a new capability, module, agent role, data model, contract or deployment profile.
---

# Alfred Decision Register

Use this skill before planning or implementing anything that adds or changes product behaviour, data
model, API contract, agent orchestration, storage, authentication, streaming or deployment profile.
The deliverable is a plan validated by the user, not code.

## Source

- Register: `docs/creative_phase_2026-07-29_post_poc_decision_workshop.md`, about 3,400 lines. Do
  not read it end to end for every task; navigate it as described below. The register is not published:
  on a clone without it, report that it is unavailable and stop; do not reconstruct it.
- It records 56 decisions `ALF-DEC-001` to `ALF-DEC-056`, one decision owner and dated revisions.
- The companion documents it links (V1 decision plan, HTML dossier, R83 review options, R85
  retention strategy) are not in this repository. Report their absence as a limitation; do not
  infer their content.
- The register was written against the POC (Next.js BFF, CopilotKit, a Python agent library). Map its
  vocabulary to this monorepo (`apps/api` NestJS, `apps/web` React/Vite, `apps/agent` LangGraph) and
  state the mapping explicitly in the plan.

## Reading Order

1. Authority header and "Cross-cutting V1 prerequisites": the evaluation criteria for every choice.
2. "Decision backlog" table: ID, question, family, status, dependencies and blast radius. Select the
   IDs that touch the task, including their `Depends on` chain.
3. Each selected record: search `ALF-DEC-0NN` for its dedicated `## ... decision — ALF-DEC-0NN`
   section. Some accepted decisions have no dedicated section: `ALF-DEC-003` exists only in
   Revision 50; `ALF-DEC-010` and `ALF-DEC-012` are in "Synchronized target slice".
4. "Workshop revision history": every entry dated after the record's `Decided` date. Revisions 82
   to 86 amend DEC-010/025/027/028/030/031/054 without rewriting every record, and the entries are
   not in numeric order (R78 and R66 appear after R82; R67 does not exist).
5. "Workshop handoff": current focus and counts.

```bash
grep -n '^## \|^### ' docs/creative_phase_2026-07-29_post_poc_decision_workshop.md
grep -n 'ALF-DEC-030' docs/creative_phase_2026-07-29_post_poc_decision_workshop.md
```

## Status Semantics

| Status                            | Meaning for implementation                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `accepted` / `accepted-with-risk` | Binding. Implement within the record; its "Still open", "Readiness" and "Revisit trigger" items are follow-ups, not licence to diverge. |
| `in-discussion`                   | Not binding. Implement only the explicitly accepted slice named in the record; ask before choosing among the listed options.            |
| `to-decide`                       | No decision. Do not build it; propose options and stop.                                                                                 |
| `deferred`                        | Out of V1 scope (MCP family 039–048, OpenAPI 056). Do not add infrastructure or abstractions for it.                                    |

Verbatim stakeholder quotes, "Synthesis — not a decision" blocks, "working recommendation" text and
"candidate only" diagrams are evidence, never requirements.

## Plan Template

Write the plan in the user's language and include:

1. **Task** and owning application(s).
2. **Binding decisions**: each `ALF-DEC` ID, its status, the sentence(s) that constrain the task and
   how the plan honours them.
3. **Open decisions touched**: IDs with status and the assumption the plan makes. Each assumption is
   a question for the decision owner.
4. **Conflicts** between the register and `docs/adr/`, `.agents/skills/` or existing code, with a
   proposed resolution (ADR that cites the record, question to the decision owner, or deferral). Known
   items are listed in `docs/memory-bank/decisions.md`.
5. **Cross-cutting check**: works directly and behind a trusted gateway; principal, resource, policy
   decision and enforcement point, fail-closed; secrets, personal data, untrusted input, side effects
   and resource limits; verification evidence.
6. **Delivery units**: bounded PR-sized steps following `docs/development/capability-delivery.md`,
   each with tests in both flag states when a capability flag is involved.
7. **Out of scope** and **questions**.

Present the plan, then stop and wait for explicit validation. After validation, implementation
follows `alfred-feature-delivery`. Record decision-relevant outcomes in the memory bank and, when
repository structure changes, in an ADR that references the `ALF-DEC` IDs it implements.

## Rules

- Never edit the register; propose amendments as questions for the decision owner.
- Cite IDs and section titles rather than paraphrases when a constraint is contested.
- Read amending revisions before trusting a record's numbers (quotas, token caps, retention).
- Do not treat the register as evidence that anything is implemented here; verify against current
  code and the memory bank.
