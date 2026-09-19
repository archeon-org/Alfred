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

File storage has one port and two adapters ([ADR 0027](../adr/0027-uploaded-file-content-store.md)):
an S3-compatible bucket, and a local directory that is a development profile refused in
production. Define read compatibility/migration before switching backends; do not silently move
failed writes to a second store. Any new adapter must pass `describeContentStoreContract`.

## Promouvoir un flag

Register a product capability in the shared names/schema, backend environment-key mapping,
implementation-readiness registry, environment parser, root/API examples, environment generator,
Compose API environment and frontend disabled manifest. Declaration does not promote a capability:
reserved capabilities remain unimplemented and default to false.
Test that configured `true` still yields effective `false` until implementation is ready.

For promotion, first deliver the real execution path and register both-state tests using
`apps/api/test/support/feature-flags.ts`:

```ts
describeFeatureBothStates('googleOAuth', buildApp, {
  whenEnabled: async (app) => {
    const response = await fetch(`${await app.getUrl()}/api/auth/google/start`, {
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
  },
  whenDisabled: async (app) => {
    await expectFeatureRouteHidden(app, 'GET', '/api/auth/google/start');
  },
});
```

Call the helper at file or suite collection time. It registers two sequential tests, then sets the
exact registry environment key before building a fresh application for each state. Both cases are
awaited assertion callbacks (`void | Promise<void>`); do not call `it`, `describe` or register hooks
inside them. A `beforeAll` hook is also too late to register tests. The helper automatically requires
a successful, schema-valid `/api/features` manifest and checks effective availability in both states.
An unpromoted feature intentionally fails the ON assertion. Do not override readiness to pass it.

`buildApp` must return an application configured with prefix `api` and already listening on an
ephemeral loopback port (`app.listen(0, '127.0.0.1')`). Construct typed configuration after the env
stub, using synthetic test inputs and the real parser; do not load private `.env` files or reuse an
already-imported `AppModule` configuration snapshot. Install the real feature guard and API exception
filter explicitly when building a focused testing module: `FeatureFlagsModule` and
`configureApplication` alone do not install the global `APP_GUARD`/`APP_FILTER` bindings.

The helper closes each returned app and restores only its flag's prior environment value, including
an originally absent key, on success or failure. Builders must close partially constructed apps if
initialization fails before returning. Keep callers sequential because process environment is shared;
do not call the helper from concurrent suites or alter the same flag from concurrent tests.

`expectFeatureRouteHidden` accepts GET, POST, PUT, PATCH and DELETE, with a full API path. It requires
HTTP 404 and `{ success: false, error: { code: 'HTTP_404' } }`, without following redirects. HEAD has
no JSON body and is not supported. Pair hidden-route checks with a real enabled route: a nonexistent
route also returns 404. Use valid query/body inputs so validation does not mask availability checks.

Google is the existing promotion example. Test its real provider registry and both legacy and generic
start routes with synthetic credentials, stubbing persistence ports. Authorization URL generation and
PKCE can run locally; use manual redirects and never exchange test credentials with Google. The OFF
case must hide Google from provider discovery and reject start/callback routes without downstream
state/session operations. This establishes a local flag/HTTP contract, not completed external login.

Run the focused helper, flag, environment and generator tests, update complete browser manifest
fixtures, then run the normal quality gates. Build `@alfred/contracts` before direct package checks:
its type/CommonJS exports use compiled output. Roll out added manifest fields on the API before the
updated browser; a browser requiring absent fields fails closed. Flags take effect on restart.

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
