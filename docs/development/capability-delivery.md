# Capability Delivery Contract

## Ownership and Dependencies

The browser calls the API through the same-origin HTTP client. Shared payloads belong in
`packages/contracts`; application implementations must not import another application's runtime.
Substantial API features use `api`, `application`, `domain` and `infrastructure` layers, with
ports declared in the domain and adapters selected by the module composition root. Small modules
do not need empty layer directories.

React follows `route -> screen -> hook -> service -> HTTP client`. Services have no React
dependency; screens/components do not perform network requests. Query hooks own server state;
session context owns sensitive in-memory client state.

`pnpm architecture:check` parses source syntax to enforce these initial boundaries and a 400-line
source-file limit. It runs locally through `pnpm test`/`pnpm verify` and in CI. It detects imports,
re-exports, dynamic imports and direct fetch calls; it is not whole-program data-flow analysis.
Keep responsibility-based design review in addition to this automated guardrail.

## Capability Contract

Before implementation, specify the owner, public payload, enabled behavior, disabled behavior,
dependencies, failure policy, persistence and tests. Classify the capability using
[ADR 0010](../adr/0010-capability-flags-and-operational-fallbacks.md):

- Product flag: hidden/disabled UI and authoritative API rejection when unavailable.
- Operational flag: documented no-op or passthrough behavior with a safe default.
- Adapter selection: one domain port, an explicit persistent default and approved alternatives.
- Invariant: authentication, authorization, validation, isolation and refresh replay protection
  cannot be disabled.

The effective product flag is **configured AND implemented**. Reserved registry entries stay
false in the public manifest and route guards even when their environment value is true. Promote
the entry in `FeatureFlagsService` only when a real execution path and both-state tests exist.
Add dependency checks when promoting dependent capabilities; a flag alone is not a health check.
Controller and handler feature requirements are cumulative.

Flags are process-start snapshots, not live remote switches. Coordinate API replica rollout;
the browser fails closed on failed manifest revalidation. Disabling a provider removes that
login option, not existing session security. If all providers are disabled, login is unavailable;
there is no implicit password/development bypass.

For file storage, implement the persistent local adapter before adding a remote adapter. Define
read compatibility/migration before switching backends; do not silently move failed writes to a
second store. No upload or S3 implementation exists yet.

## Bounded Delivery Units

Split work into independently verifiable changes:

1. Contract, domain rules and focused failing tests.
2. Application use case and one adapter, with integration tests.
3. API boundary, validation, authorization and both flag states.
4. Browser service/hook/screen, with error and disabled-state behavior.
5. Deployment configuration, operational guidance and verification evidence.

Each unit has an explicit file scope. Reuse existing boundaries; do not create speculative
frameworks or wire the agent runtime before service authentication and principal handoff exist.

## Verification and Handoff

Run focused regressions, `pnpm verify` and relevant E2E suites. Use a disposable PostgreSQL database
for persistence and lock behavior; report skipped database tests separately. Browser tests must
cover authentication, refresh failures and retry/logout ordering when those paths change.
Refresh/logout requests and browser lock acquisition each have a 15-second deadline; a timeout
is recoverable failure, not proof of server cancellation or successful logout.

Record neutral project facts in the [memory bank](../memory-bank/README.md): durable decisions in
ADRs, current boundaries/limitations in indexed documents, dated command outcomes in one session
record. Do not include requester narratives, personal context or unsupported deployment claims.
