import { agentListEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiRoute,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

const topology = {
  id: '2c4f8a1e-7b3d-5e6f-9a0b-4d1c8e7f2a35',
  graphId: 'topology',
  name: 'topology',
  shortDescription: 'Explores the infrastructure topology of an application.',
  description:
    'Answers questions about servers, network links and dependencies of an application from the topology graph. Read-only.',
  tags: ['topology', 'infrastructure'],
};
const elasticRag = {
  id: '6d1f0c3a-2b7e-5c49-8a15-3e9f7b2d4c61',
  graphId: 'elastic_rag',
  name: 'elastic_rag',
  shortDescription: 'Searches the operations knowledge base.',
  description: null,
  tags: ['elasticsearch', 'rag'],
};
/** A specialist whose runtime metadata only says `is_subagent: true`. */
const bare = {
  id: '9e3b5d7f-1a2c-5b4d-8f6e-0c9a7b5d3e11',
  graphId: 'base_react_basic',
  name: 'base_react_basic',
  shortDescription: null,
  description: null,
  tags: [],
};
/** The cursor the API issues after `bare` and `elasticRag` for this catalog, with no search. */
const NEXT_CURSOR = 'eyJ2IjoiZjIwNWZkYTI4NWUxZGUwOSIsInEiOiJlM2IwYzQ0Mjk4ZmMxYzE0IiwibyI6Mn0';

export const DocListAgents = () =>
  applyDecorators(
    ApiRoute(
      'List the specialist agents of the runtime catalog',
      `The assistants the agent runtime declares as specialists the orchestrator can delegate to, searched with \`search\` and paged by cursor. Read-only, no side effect.

- **The same list for every signed-in account.** It is not filtered by the caller's habilitation and listing an agent grants nothing: the runtime still enforces habilitation when a delegation happens. Do not present it as "the agents you are allowed to use".
- **Order**: by \`name\` ignoring case, then exact \`name\`, then \`id\`; every agent has one position, stable across pages.
- **Paging**: \`limit\` 1 to 100 (default 20). Send \`data.nextCursor\` back unchanged as \`cursor\` **with the same \`search\`**; \`limit\` may differ from one page to the next. \`nextCursor: null\` is the last page.
- **Catalog versions**: the API keeps the catalog in memory for 30 seconds, so searching and paging usually cost no runtime call. A cursor belongs to one version of the catalog content. A refresh that finds the same agents keeps cursors valid; once an agent was added, removed or changed, a cursor of the older version answers \`409 agent_catalog_changed\`: drop every page you hold and start again without \`cursor\`, so two versions are never mixed.
- **No fallback list**: when the runtime cannot be read, or holds more than 200 assistants (a truncated catalog would hide specialists), the answer is \`503 agent_catalog_unavailable\`, never a stale or partial list. Retry later.
- **Capability \`teams\`**: when it is off the route answers \`404\`, before the access token is even looked at.`,
    ),
    ApiEnvelopeResponse({
      name: 'AgentCatalogPage',
      description: 'One page of the specialists matching `search`, ordered by name.',
      contract: agentListEnvelopeSchema,
      describe: {
        'data.items[].id':
          'Identifier of the assistant in the agent runtime. An opaque string of 1 to 128 characters: do not assume a UUID.',
        'data.items[].graphId':
          'Name of the runtime graph the assistant runs, 1 to 128 characters. Searchable.',
        'data.items[].name':
          'Name of the assistant in the runtime, trimmed, at most 120 characters (a longer one is cut and ends with `…`); the `graphId` when the runtime name is blank. A technical name such as `elastic_rag`, not a display label. The list is ordered by it.',
        'data.items[].shortDescription':
          'One-line summary declared in the runtime metadata, trimmed, at most 280 characters (cut with a final `…` beyond); `null` when none is declared.',
        'data.items[].description':
          'Full description declared in the runtime metadata, trimmed, at most 2 000 characters (cut with a final `…` beyond); `null` when none is declared.',
        'data.items[].tags':
          'Keywords declared in the runtime metadata: trimmed, without duplicates, at most 16 tags of at most 40 characters. Empty when none is declared. Searchable.',
      },
      data: { items: [bare, elasticRag, topology], nextCursor: null },
      more: {
        firstPage: {
          summary: 'First page with `limit=2`: more agents follow, fetch them with `nextCursor`',
          data: { items: [bare, elasticRag], nextCursor: NEXT_CURSOR },
        },
        search: {
          summary: 'Filtered with `search=infra topo`: both terms found in the same agent',
          data: { items: [topology], nextCursor: null },
        },
        empty: {
          summary: 'Nothing matches `search`, or the runtime declares no specialist',
          data: { items: [], nextCursor: null },
        },
      },
    }),
    ApiErrors(
      PROBLEM.validation(
        '`limit` is above 100 or is not an integer (below 1: `limit must not be less than 1`). One message per broken parameter, so several can come together.',
        'limit must not be greater than 100',
      ),
      PROBLEM.validation(
        '`search` is longer than 100 characters. A NUL character in `search` and a `cursor` longer than 512 characters are refused the same way, with their own message.',
        'search must be shorter than or equal to 100 characters',
      ),
      PROBLEM.unknownField,
      {
        ...PROBLEM.invalidCursor,
        when: 'The `cursor` does not have the format this route issues (altered, truncated, empty, taken from another route), or it is sent with another `search` than the one it was issued for. Restart from the first page without `cursor`.',
      },
      PROBLEM.unauthenticated,
      PROBLEM.invalidToken,
      PROBLEM.featureDisabled('teams'),
      {
        status: 409,
        code: 'agent_catalog_changed',
        message: 'The agent catalog changed; reload the list from the first page.',
        when: 'The `cursor` belongs to an older version of the catalog: an agent was added, removed or changed since it was issued. Discard the pages already loaded and call again with the same `search` and no `cursor`.',
      },
      {
        status: 503,
        code: 'agent_catalog_unavailable',
        message: 'Internal server error',
        when: 'The agent runtime is not configured, unreachable, too slow (10 seconds for the whole read), answered something unreadable, or holds more than 200 assistants. No stale list is served. Retry later; the message never carries runtime details.',
      },
    ),
  );
