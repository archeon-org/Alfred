# ADR 0009: Responsibility-Visible Application and Test Topology

- Status: Accepted
- Date: 2026-09-04

## Context

The React source tree mixed product areas, technical responsibilities and colocated tests. A reader
had to inspect a file before knowing whether it was a route, screen, query hook, transport service
or reusable component. Server state was also wrapped in custom contexts even though TanStack Query
already owned its fetching and caching lifecycle.

The NestJS authentication module grouped controllers, persistence, provider adapters and tokens in
generic `services`, `entities` and `providers` folders. API tests were outside `src`, but their
placement mixed unit, contract, integration and E2E semantics.

## Decision

### React/Vite

- The first source level communicates responsibility: `app`, `routes`, `screens`, `components`,
  `contexts`, `hooks`, `services` and `lib`. Product domains appear below those responsibilities.
- The dependency flow is `route -> screen -> hook -> service -> HTTP client -> NestJS`.
- Routes only map URLs and enforce navigation/session boundaries. Screens compose a user journey.
  Reusable components receive typed props and do not fetch data directly.
- Services contain framework-independent requests and boundary validation. Hooks adapt services to
  React and TanStack Query. Context is reserved for genuinely shared client state such as the
  in-memory session, not duplicated server caches.
- The shared HTTP client accepts only same-origin relative paths, adds the in-memory access token,
  deduplicates refresh and retries `GET`, `HEAD` and `OPTIONS` after an unauthorized response.
  Mutations require explicit retry opt-in.

### NestJS

- Feature modules remain the unit of ownership. Internally, substantial modules use `api`,
  `application`, `domain` and `infrastructure`.
- Controllers and DTOs stay in `api`; use-case orchestration stays in `application`; dependency-free
  rules and ports stay in `domain`; TypeORM, JWT and remote identity adapters stay in
  `infrastructure`.
- A feature module file is the composition root and exports only the providers that form its public
  API. Existing small modules migrate when their business surface justifies the layers.
- Application services receive infrastructure capabilities through symbol-backed domain ports.
  They do not import concrete TypeORM, JWT or remote-provider adapters.

### Tests

- Production source trees contain no test files.
- Each app owns an external `test` root split into `unit`, `integration`, `contract`,
  `architecture`, `e2e` and `support`.
- Unit-test paths mirror only the source branches they exercise. Integration and contract tests are
  organized by boundary, while E2E tests are selected by a distinct runner configuration.
- Executable architecture tests reject test files under `src` and check the agreed top-level
  boundaries.

## Rationale and References

- React recommends custom hooks for reusable stateful logic and notes that project boundaries are a
  project decision: https://react.dev/learn/reusing-logic-with-custom-hooks
- NestJS recommends grouping closely related capabilities in feature modules and treats exported
  providers as the module public interface: https://docs.nestjs.com/modules
- NestJS controllers should delegate complex work to injectable providers:
  https://docs.nestjs.com/providers
- Vitest supports separate project/configuration boundaries when suites require different
  environments or behavior: https://vitest.dev/guide/projects

These sources inform the roles; they do not prescribe Alfred's folder names. The final topology is
an Alfred decision optimized for navigation, test isolation and security review.

## Consequences

- A developer can identify the rendering, React state, transport and backend layers before opening
  a file.
- Moving tests changes import paths, so test-only aliases are configured explicitly and production
  TypeScript no longer includes Vitest globals.
- The session context remains because it owns sensitive in-memory client state. Auth-provider and
  feature-flag contexts are removed because they duplicated server-state ownership.
- Layer folders alone do not prove clean architecture. Architecture tests enforce the initial
  dependency direction and must grow with each migrated module.
