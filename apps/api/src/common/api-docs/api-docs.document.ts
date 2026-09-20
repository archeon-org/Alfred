import { apiErrorSchema } from '@alfred/contracts';
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_ERROR_COMPONENT } from './api-docs.decorators';
import { contractSchema } from './contract-schema';

/** Shown at the top of the documentation: the rules every route follows, said once. */
export const API_DOCS_DESCRIPTION = `
HTTP API of the self-hosted Alfred platform. Every route below lists its inputs, its answers and
its errors with real examples. This page exists outside production only.

## Authentication
Private routes (padlock) need \`Authorization: Bearer <access token>\`. The access token is a
short-lived JWT obtained by signing in (\`/api/auth\`) and renewed with \`POST /api/auth/refresh\`.
The user is the token's subject: no route reads an identity from a header, a query parameter or a
body field. Click **Authorize** and paste the token without the \`Bearer\` prefix.

## Answers
A success is \`{ "success": true, "data": … }\`. A list puts \`items\` and \`nextCursor\` in \`data\`.
A failure is \`{ "success": false, "error": { "code", "message", "details"? } }\`:
branch on \`error.code\`, which is stable; \`message\` is for people and can be a string or a list of
strings (validation). Every answer carries \`Cache-Control: no-store\`.

## Conventions
- **Identifiers** are UUIDs. An unknown, a foreign and a malformed identifier all answer the
  resource's \`404\`: the API never reveals that something exists for someone else.
- **Pagination** is by cursor: send \`limit\` (1–100, default 20) and the \`nextCursor\` you received,
  unchanged, as \`cursor\`. \`nextCursor: null\` is the last page.
- **Optimistic writes**: a resource that can be edited concurrently carries a \`version\` or
  \`revision\`; send it back as \`expectedVersion\` / \`expectedRevision\`. A stale value answers \`409\`
  with the current one: re-read, never overwrite blindly.
- **Unknown fields are refused** with a \`400\`, in bodies and in query strings.
- **Capabilities**: a route of a switched-off capability answers \`404\` "Feature is not available".

## Headers
Every answer carries \`x-request-id\` and \`traceparent\`; quote the request id when reporting a
problem. An incoming \`X-Request-Id\` is kept when it is well formed.

## Safe retries
Creation routes that accept an \`Idempotency-Key\` header say so. One key per intent: the same key
with the same request replays the stored answer for 24 hours; with another request it answers
\`422 idempotency_mismatch\`.

## Outside the \`/api\` prefix
\`GET /health\`, \`GET /health/live\`, \`GET /health/ready\` and \`GET /metrics\` are served at the
root, without the prefix, and are not rate limited.

## Errors every other route can answer
| Status | \`error.code\` | Meaning |
| --- | --- | --- |
| 429 | \`HTTP_429\` | Rate limit: per address, and per account once authenticated. The wait, in seconds, is in a header named after the limit that was hit: \`Retry-After-ip\`, \`Retry-After-authenticated\`, or the route's own. There is no plain \`Retry-After\` |
| 500 | \`HTTP_500\` | Unexpected failure |
| 5xx | a domain code | A known dependency failure keeps its \`error.code\` (for example \`storage_unavailable\`) |

Every answer of status 500 or above has the message "Internal server error" and no \`details\`,
whatever its code: the cause is in the server log, under the request id.
`.trim();

export const API_DOCS_TAGS: Readonly<Record<string, string>> = {
  agents: 'Specialist agents of the runtime catalog, read-only.',
  auth: 'Sign-in with an identity provider, session refresh and sign-out.',
  context:
    'Personal instructions and response preferences, and the context and preferences of a project: Markdown documents with a revision.',
  conversations: 'Chats of a project: create, list, rename, pin, move and delete.',
  executions: 'One submitted message and the work that answers it: start, observe, stop.',
  files: 'The personal file library: upload, folders, download and message attachments.',
  health: 'Liveness and readiness probes. Public.',
  observability: 'Prometheus metrics, protected by a scrape token rather than a session.',
  platform:
    'What this deployment offers. `GET /api/features` is public; `GET /api/platform/status` needs a session.',
  projects: 'Named projects and the private shell of a standalone chat.',
  skills:
    'Personal skills: authoring, versions and publication, plus the published read side a skills consumer uses.',
  users: 'The signed-in account and its workspaces.',
};

/** Shared schemas the route decorators refer to by `$ref`. */
export function applyApiDocsComponents(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas[API_ERROR_COMPONENT] = contractSchema(
    API_ERROR_COMPONENT,
    apiErrorSchema,
    {
      describe: {
        success: 'Always `false`.',
        error: 'What went wrong.',
        'error.code':
          'Stable machine-readable code: a domain code such as `skill_not_found`, or `HTTP_<status>` when the failure has no domain meaning. Branch on this.',
        'error.message':
          'Human-readable explanation. A list of strings for validation failures, one per broken rule.',
        'error.details':
          'Machine-readable context, present only on the codes that document it (for example `currentRevision` on a revision conflict).',
      },
    },
  );
  return document;
}
