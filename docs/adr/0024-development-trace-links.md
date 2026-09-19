# ADR 0024: Development Trace Links to the Runtime Console

- Status: Accepted
- Date: 2026-09-16
- Amends: [ADR 0023](0023-durable-execution-streaming.md) (browser contract), complements
  [ADR 0005](0005-environment-feature-flags.md) and [ADR 0010](0010-capability-flags-and-operational-fallbacks.md)
- Architecture constraints: ALF-DEC-032 and ALF-DEC-033 (`accepted`), ALF-DEC-050
  (`accepted-with-risk`), ALF-DEC-008 and ALF-DEC-051 (`in-discussion`, evidence only).

## Context

The runtime that Alfred dispatches to (`AGENT_RUNTIME_URL`) traces its runs in LangSmith when the
operator configures it so. The product owner asked for a control under each answer that opens the
exact trace of that answer while developing. ADR 0023 and `packages/contracts`
(`alfredRunStateSchema`) promise that no native runtime identifier reaches the browser (ALF-DEC-032
§5, ALF-DEC-033 §5), and the target-architecture chapters under `docs/architecture/` forbid LangSmith
egress altogether (`01…:38,522`, `08…:185,297,396`, `04…:403`, `07…:1143`). The LangSmith console
address of a run is `{ui}/o/{organisation}/projects/p/{project}/r/{run}?poll=true` (as both
LangSmith SDKs build it) and, for a LangGraph runtime, the run identifier already stored in
`api_executions.runtime_run_id` is the root trace identifier.

## Decision

- `traceLinks` is a product capability (ADR 0005 registry, `FEATURE_TRACE_LINKS_ENABLED`, default
  `false`, published in the manifest). Enabling it requires `TRACE_LINK_UI_URL`,
  `TRACE_LINK_ORGANIZATION_ID` and `TRACE_LINK_PROJECT_ID`; no credential is involved. Environment
  validation **refuses** the flag when `NODE_ENV=production`: it is a development diagnostic and is
  never part of the Enterprise profile.
- `TRACE_LINK_UI_URL` is a plain `http(s)` origin with an optional path: credentials, query and
  fragment are refused at startup, the URL builder refuses credentials again, and the shared
  contract (`executionTraceLinkSchema`) rejects a link carrying them. A generated link never
  transports a secret.
- `GET /api/executions/:id/trace-link` returns `{ url }`. It reuses the execution observation
  authorization (owner of the conversation, active binding), is hidden (`404`) while the capability
  is off, and answers `404 trace_unavailable` while the execution has no runtime run. The URL is
  built server-side with every segment encoded; the browser never calls the console.
- The runtime run identifier leaves the API **only** inside that URL, while the capability is on.
  Execution DTOs, `AlfredRunState` and the AG-UI stream are unchanged: AG-UI `runId` stays the
  Execution id. This is the bounded exception ADR 0023's browser contract now carries.
- The browser shows the control only when the manifest says `traceLinks: true`; it opens the
  address in a new tab with `noopener,noreferrer` and keeps it as a plain link. No `VITE_*` flag:
  a hidden control is not a security boundary (ADR 0005). `traceLinks` is the first additive
  manifest field with a `false` default in the shared schema: a browser built after this ADR still
  works in front of an API built before it, with the capability read as disabled.

## Consequences

- ALF-DEC-051 §7 ("an identifier must not silently enter a new sink") is honoured by construction:
  the trace already exists in the runtime's console; Alfred adds a link to it, documented here, off
  by default and refused in production. Who can open it is whoever holds a LangSmith session for
  that organisation (ALF-DEC-050 §3: the identifier is never a bearer credential).
- The divergence with the LangSmith ban in `docs/architecture/` is explicit and limited to the
  development profile; the production contract stays "no LangSmith". Removing the capability later
  is a registry deletion plus the route.
- Tests cover both flag states (`describeFeatureBothStates('traceLinks', …)`), the URL builder, the
  environment validation (required keys, production refusal), the browser control with and without
  the capability, and one browser test opening the tab.
