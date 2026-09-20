# API documentation (OpenAPI / Swagger)

The OpenAPI document served at `/api/docs` is part of the API contract. Whoever integrates with
Alfred reads it instead of the source, so a route without its inputs, answers, errors and examples
is an unfinished route.

**Rule: every change to an HTTP route updates its OpenAPI documentation in the same change.** That
covers a new route, a new or changed parameter, body field, answer field, status, error code,
limit, default or behaviour a caller can observe. `test/contract/http/openapi-completeness.spec.ts`
fails otherwise, and it discovers controllers from the source tree, so a new controller cannot be
left out.

The documentation exists outside production only (`FEATURE_OPENAPI_ENABLED`, refused when
`NODE_ENV=production`). It must still never contain a secret, a real token, a real e-mail address
or any real user content: use `example.test` addresses and invented text.

## Where things live

| What                                                                                                                                                                                                                                                                                                                                                                                                        | Where                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Helpers: `ApiRoute`, `ApiEnvelopeResponse`, `ApiJsonResponse` (both take `headers`), `ApiJsonBody`, `ApiIdParam`, `ApiNoContent`, `ApiIdempotencyKeyHeader`, `ApiErrors`                                                                                                                                                                                                                                    | `apps/api/src/common/api-docs/api-docs.decorators.ts`                                                                                                                                                                                                                                                                           |
| Shared error answers: `...PROBLEM.session`, `PROBLEM.accountUnavailable`, `notFound('skill')`, `featureDisabled('skills')`, `validation(…)`, `unknownParameter(name)`, `invalidCursor`, `bodyTooLarge` / `bodyTooLargeAt(bytes)`, `rateLimited(throttler, when)`, `masked(status, code, when)`, `projectArchived`, `projectDeleting`, `projectImplicit`, `threadBusy`, and `idempotencyProblems(reconcile)` | `apps/api/src/common/api-docs/api-problems.ts`                                                                                                                                                                                                                                                                                  |
| Page introduction, tag descriptions, shared `ApiError` schema                                                                                                                                                                                                                                                                                                                                               | `apps/api/src/common/api-docs/api-docs.document.ts`                                                                                                                                                                                                                                                                             |
| A module's route documentation                                                                                                                                                                                                                                                                                                                                                                              | `apps/api/src/modules/<module>/api/<name>.openapi.ts`, one `Doc<Route>()` decorator per route                                                                                                                                                                                                                                   |
| Worked examples                                                                                                                                                                                                                                                                                                                                                                                             | `modules/context/api/context.openapi.ts` (bodies, conflicts), `modules/skills/api/published-skills.openapi.ts` (lists, files), `modules/projects/api/projects.openapi.ts` (idempotent creation), `modules/files/api/files-upload.openapi.ts` (multipart), `modules/stream/api/execution-stream.openapi.ts` (server-sent events) |

A controller stays readable: one `@Doc…()` line per route, nothing else. A `.openapi.ts` file
obeys the 400-line limit like any source file; split it by resource when it grows.

## How a route is documented

```ts
@Put(':kind')
@DocSaveProjectContext()
async save(...) {}
```

```ts
export const DocSaveProjectContext = () =>
  applyDecorators(
    ApiRoute('Update the context or the preferences of a project', `What it does, what a caller must know…`),
    ApiIdParam('projectId', 'Identifier of a project the signed-in account owns.', PROJECT_ID),
    ApiParam({ name: 'kind', description: '…', schema: { type: 'string', enum: [...], example: 'context' } }),
    ApiJsonBody({ name, description, contract: saveContextDocumentInputSchema, describe: {...}, examples: {...} }),
    ApiEnvelopeResponse({ name, description, contract: contextDocumentEnvelopeSchema, describe: {...}, data: {...} }),
    ApiErrors(PROBLEM.unauthenticated, PROBLEM.invalidToken, PROBLEM.notFound('project'), { status: 409, code: '…', message: '…', when: '…' }),
  );
```

1. **Schemas come from the wire contracts** (`@alfred/contracts`, zod). Types and bounds are never
   retyped by hand, so the documentation cannot drift from what the API validates and what the
   browser parses. A surface with no web contract (health, metrics) declares a local zod schema in
   its `.openapi.ts` file.
2. **Every field is described**, by path: `data.items[].name`, `files[].path`, `details{}`. The
   envelope fields (`success`, `data`, `data.items`, `data.nextCursor`) are described once for all.
   Say what the field means and what a caller does with it, not its type.
3. **Every example is real and is checked**: each example is parsed by its contract when the
   decorator evaluates; one the contract refuses fails the test. Prefer payloads captured from the
   running API. A success answer passes its payload as `data`; the envelope is added for you.
4. **Errors are exact**: status, `error.code`, the message the API really sends, `details` when
   there are some, and `when` — the situation, in one sentence, with what the caller should do.
   Read the service to find them; never guess a code. A private route documents its `401`
   (`...PROBLEM.session`, plus `PROBLEM.accountUnavailable` when its code path reads the account);
   a route that takes a body or a query string documents its `400`. Two traps the first review
   caught: an answer of status 500 or above always carries the message "Internal server error"
   and no `details`, whatever the service throws (`PROBLEM.masked`), and the rate-limit header is
   `Retry-After-<throttler>`, never a plain `Retry-After`.
5. **Query parameters are documented on their DTO** with `@ApiPropertyOptional`, next to the
   validation rules. An optional parameter gives its example in the description
   (`Example: \`incident-runbook\`.`), because Swagger UI pre-fills "Try it out" with machine
   examples and a pre-filled filter silently empties a list. A required parameter (a path
   identifier) carries a machine example.
6. **The padlock tells the truth**: `@ApiBearerAuth('bearerAuth')` on private routes only. A
   controller that mixes `@Public()` and private routes puts it on the methods, not on the class.
7. **Tags** are described in `API_DOCS_TAGS`; a new tag needs its line there.
8. **Non-JSON answers** (server-sent events, file downloads, plain text, redirects) use
   `ApiResponse` with their real media type, a schema and an example, or a description alone for
   `204` and `3xx`.

## Checking

```bash
pnpm --filter @alfred/api exec vitest run test/contract/http/openapi-completeness.spec.ts
```

```bash
pnpm --filter @alfred/api exec vitest run test/contract/http/openapi-completeness.spec.ts -t "skills.controller"
```

The first test of the file reports documentation mistakes found while decorators evaluate: an
example its contract refuses, a described path that does not exist, a field without description.
They are recorded, never thrown, so a wrong comment cannot stop the API from starting.

To write the document to a file, for a reviewer or an integrator without a running API:

```bash
OPENAPI_DUMP="$PWD/openapi.json" pnpm --filter @alfred/api exec vitest run test/contract/http/openapi-completeness.spec.ts
```

To read the result as a person would, run the API outside production with
`FEATURE_OPENAPI_ENABLED=true` and open `/api/docs`; the raw document is at `/api/docs-json`.
