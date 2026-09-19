# ADR 0026: Agent Catalog Read Model from Native Runtime Assistants

- Status: Accepted
- Date: 2026-09-17
- Complements: [ADR 0005](0005-environment-feature-flags.md), [ADR 0010](0010-capability-flags-and-operational-fallbacks.md),
  [ADR 0022](0022-runtime-chat-bridge.md)
- Architecture constraints: ALF-DEC-052 and ALF-DEC-005 and ALF-DEC-024 (`accepted`), ALF-DEC-050
  (`accepted-with-risk`); ALF-DEC-038 and ALF-DEC-051 (`in-discussion`, not implemented).

## Context

The workspace right panel tab « Équipes » showed three fake agents. The product owner asked it
to list the specialists the orchestrator can delegate to. The runtime deployment
(`AGENT_RUNTIME_URL`, LangGraph Agent Server) now describes every assistant with a JSON string in
its native `description` field: `description`, `short_description`, `tags`, `visibility` and
`is_subagent`. A 2026-09-10 proposal for a custom runtime route that computes per-user permission
was set aside: the native `POST /assistants/search` carries enough metadata.

## Decision

- `teams` is promoted to an implemented capability (`FEATURE_TEAMS_ENABLED`, default `false`). One
  API setting drives both planes: the API hides `GET /api/agents` (`404`) and the manifest publishes
  `teams: false`, so the browser removes the « Équipes » tab.
- `apps/api/src/modules/agents` owns the read model: `AgentsController` (`GET /api/agents`),
  `AgentCatalogService`, the `AgentCatalogPort` and the `LangGraphAgentCatalog` adapter, which
  reuses the executions runtime transport (JSON byte bound, safe error codes, no redirect).
- The adapter pages `POST /assistants/search` (20 per page, `select` limited to identifier, graph,
  name and description, at most 200 assistants, 10 s budget). The bound counts native assistants,
  before the sub-agent filter. When all ten pages are full, one more request for a single
  assistant at offset 200, within the same budget, tells a catalog of exactly 200 (returned) from
  a larger one, which is refused rather than truncated.
- An assistant is a sub-agent only when its description parses as JSON with `is_subagent === true`.
  `visibility.ui` is deliberately ignored (owner decision, 2026-09-17). Null, plain-text or
  malformed descriptions are not sub-agents. Text is trimmed and bounded, tags are deduplicated
  and capped; `config`, `context`, `metadata` and the raw JSON never leave the API.
- The catalog is the same for every authenticated user and is cached 30 s in the API process with
  a shared in-flight request. Any runtime failure answers `503 agent_catalog_unavailable`
  and clears the cache: no stale or fallback list (ALF-DEC-005 §11).
- The browser follows `route → screen → hook → service`: `listAgents` validates the envelope with
  `agentCatalogEnvelopeSchema`, `useAgentCatalog` caches it 60 s, and `AgentCatalog` renders loading,
  retryable failure, empty and list states as plain text. The local team builder preview is kept
  unchanged below the catalog.

## Consequences

- The runtime deployment stays the catalog owner (ALF-DEC-052); the product only filters.
- Listing an agent grants nothing: the list is not habilitation-filtered per user, and the runtime
  still enforces habilitation when the orchestrator delegates (ALF-DEC-005). The UI does not call
  them « vos agents autorisés ».
- No user identifier is sent to the runtime for this read (ALF-DEC-051 untouched). The `X-API-Key`
  service key remains postponed as for ADR 0022 (ALF-DEC-050).
- Selecting, pinning or binding agents to an Execution (ALF-DEC-024 follow-ups), manifests
  (ALF-DEC-038) and `visible`/`public`/`enabled` as distinct runtime fields (ALF-DEC-052 §4) are
  not implemented; the runtime metadata exposes no `enabled` field yet.
