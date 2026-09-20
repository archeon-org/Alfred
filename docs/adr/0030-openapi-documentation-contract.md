# ADR 0030: OpenAPI Documentation as a Tested Part of the API Contract

- Status: Accepted
- Date: 2026-09-20
- Complements: [ADR 0010](0010-capability-flags-and-operational-fallbacks.md) (the private
  `FEATURE_OPENAPI_ENABLED` switch and its production exclusion are unchanged) and
  [ADR 0006](0006-provider-neutral-identity-and-runtime-principal.md) (wire contracts live in
  `packages/contracts`).
- Architecture constraints: none of the 56 register records decides how Alfred's own API is
  documented. `ALF-DEC-056` (`deferred`) concerns importing third-party tools from OpenAPI
  specifications and is **not** touched: no tool import, gateway or generated client is introduced.

## Context

The API served `/api/docs`, but the document only listed paths. No route had a summary, a
described parameter, a body schema, an answer schema, an error or an example: DTO classes carry
`class-validator` rules and no `@ApiProperty`, the Swagger CLI plugin is not used, and answers are
plain objects. On 2026-09-20 the first external integrator (the agent runtime's developer) had to
be handed a hand-written Markdown guide instead, which is exactly the drift a generated document
exists to prevent. The product owner asked for complete documentation of every route and for a
standing rule that an agent changing a route updates it.

Two sources of truth already describe the wire: the zod contracts of `packages/contracts`, which
the browser parses answers with, and the DTO classes, which validate inputs. Retyping either by
hand in Swagger decorators would add a third one.

## Decision

- **Schemas are derived from the wire contracts.** `common/api-docs/contract-schema.ts` converts a
  zod contract to an OpenAPI 3.0 schema (`z.toJSONSchema`, target `openapi-3.0`) and removes what
  only adds noise (generated patterns beside a `format`, 2^53 bounds). Request bodies use the input
  contracts, answers the envelope contracts. A surface without a web contract (health, metrics)
  declares a local zod schema next to its documentation.
- **Documentation lives beside the controller, not in it.** Each module has
  `api/<name>.openapi.ts` exporting one `Doc<Route>()` decorator per route, built from a small set
  of helpers (`ApiRoute`, `ApiEnvelopeResponse`, `ApiJsonResponse`, `ApiJsonBody`, `ApiIdParam`,
  `ApiErrors`, the `PROBLEM` presets). Query parameters are documented on their DTO class, next to
  their validation rules.
- **Every field is described and every example is checked.** Field descriptions are given by path
  and a path that does not exist is a mistake; each example is parsed by its contract when the
  decorator evaluates. Mistakes are recorded in a registry and **never thrown**, so documentation
  cannot stop the API from starting.
- **A contract test is the gate.** `test/contract/http/openapi-completeness.spec.ts` discovers every
  controller from the source tree, builds the same document as `/api/docs-json` without a database,
  and fails on a route lacking a summary, a useful description, a described parameter, a body or
  answer schema with described fields and an example, a documented `401` when private, a documented
  `400` when it takes input, a padlock that contradicts `@Public()`, or an undescribed tag; it also
  fails on any recorded mistake.
- **The rule is written where agents read it**: `AGENTS.md`, the `alfred-backend`,
  `alfred-feature-delivery` and `alfred-quality-gate` skills, the Codex `backend-engineer` and
  `reviewer` roles, and the capability delivery contract. The how-to is
  `docs/development/api-documentation.md`.

## Consequences

- A route cannot be added or changed without its documentation: the default test run fails.
- Types and bounds in the documentation cannot drift from the contracts. Descriptions, error lists
  and behavioural sentences still can: they are prose read from the code, which is why the rule
  asks for them in the same change and why a reviewer treats stale documentation as a defect.
- Decorators evaluate the conversion at import time in every environment, production included,
  where the result is unused. The cost is a few milliseconds at boot and no runtime dependency
  beyond `zod`, already present.
- Optional query parameters give their example in the description rather than as a machine
  example, because Swagger UI pre-fills "Try it out" with machine examples and a pre-filled filter
  silently empties a list.
- The documentation remains excluded from production. It still must not contain a secret, a real
  token, a cookie value, a real address or user content.

## Open

- Answers that have no zod contract yet are documented with local schemas; promoting the ones the
  browser also parses into `packages/contracts` is follow-up work.
- The document is not yet published as a versioned artifact (file or registry) for integrators
  without access to a running development API.
