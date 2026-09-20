import { AGENT_NAME_MAX_LENGTH, type AgentPage, type AgentSummary } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';
import {
  decodeAgentCursor,
  encodeAgentCursor,
  pageAgents,
  snapshotCatalog,
  type AgentPageResult,
  type AgentSearchQuery,
} from '@api/modules/agents/domain/agent-search';

const agent = (name: string, extra: Partial<AgentSummary> = {}): AgentSummary => ({
  id: `id-${name}`,
  graphId: name,
  name,
  shortDescription: null,
  description: null,
  tags: [],
  ...extra,
});

const catalog = [
  agent('topology', { shortDescription: 'Topologie réseau des applications.' }),
  agent('elastic_rag', { tags: ['elasticsearch', 'rag'] }),
  agent('ClarifyAgent', { description: 'Disambiguates operational queries.' }),
  agent('base_react_basic'),
  agent('CFTAgent_LightRAG_HTTP'),
];

function page(result: AgentPageResult): AgentPage {
  if (result.kind !== 'page') throw new Error(`Expected a page, got ${result.kind}`);
  return result.page;
}
const names = (result: AgentPageResult) => page(result).items.map((item) => item.name);
const search = (agents: readonly AgentSummary[], query: AgentSearchQuery) =>
  pageAgents(snapshotCatalog(agents), query);

describe('pageAgents', () => {
  it('orders the whole catalog by name regardless of case', () => {
    expect(names(search(catalog, { limit: 20 }))).toEqual([
      'base_react_basic',
      'CFTAgent_LightRAG_HTTP',
      'ClarifyAgent',
      'elastic_rag',
      'topology',
    ]);
  });

  it('searches names, descriptions and tags ignoring case, accents and separators', () => {
    const found = (text: string) => names(search(catalog, { limit: 20, search: text }));
    expect(found('react basic')).toEqual(['base_react_basic']);
    expect(found('LIGHTRAG_http')).toEqual(['CFTAgent_LightRAG_HTTP']);
    expect(found('topologie reseau')).toEqual(['topology']);
    expect(found('operational')).toEqual(['ClarifyAgent']);
    expect(found('elasticsearch')).toEqual(['elastic_rag']);
    expect(found('  ')).toHaveLength(5);
    expect(page(search(catalog, { limit: 20, search: 'absent' }))).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('pages one catalog version to its end with cursors bound to the search', () => {
    const snapshot = snapshotCatalog(catalog);
    const first = page(pageAgents(snapshot, { limit: 2 }));
    expect(first.items.map((item) => item.name)).toEqual([
      'base_react_basic',
      'CFTAgent_LightRAG_HTTP',
    ]);
    const second = page(pageAgents(snapshot, { limit: 2, cursor: first.nextCursor ?? '' }));
    expect(second.items.map((item) => item.name)).toEqual(['ClarifyAgent', 'elastic_rag']);
    const last = pageAgents(snapshot, { limit: 2, cursor: second.nextCursor ?? '' });
    expect(names(last)).toEqual(['topology']);
    expect(page(last).nextCursor).toBeNull();

    // The same cursor with another search is not a position in that result.
    expect(
      pageAgents(snapshot, { limit: 2, search: 'rag', cursor: first.nextCursor ?? '' }),
    ).toEqual({ kind: 'invalid_cursor' });
  });

  it('keeps cursors across identical reloads and refuses them once the content changed', () => {
    const cursor = page(search(catalog, { limit: 2 })).nextCursor ?? '';
    // A cache refresh returning the same agents, in any order, is the same version.
    expect(names(search([...catalog].reverse(), { limit: 2, cursor }))).toEqual([
      'ClarifyAgent',
      'elastic_rag',
    ]);
    // Renames that would move agents across the cursor restart the reader instead.
    const renamed = catalog.map((item) =>
      item.name === 'base_react_basic' ? { ...item, name: 'omega' } : item,
    );
    expect(search(renamed, { limit: 2, cursor })).toEqual({ kind: 'catalog_changed' });
  });

  it('emits accepted cursors for the longest Unicode and escaped names', () => {
    const characters = ['é', String.fromCodePoint(0x1f600), '"', '\\', String.fromCharCode(1)];
    const agents = characters.map((character, index) =>
      agent(character.repeat(AGENT_NAME_MAX_LENGTH), { id: `id-${index}` }),
    );
    const snapshot = snapshotCatalog(agents);
    let cursor: string | undefined;
    const seen: string[] = [];
    do {
      const current = page(pageAgents(snapshot, { limit: 1, cursor }));
      seen.push(...current.items.map((item) => item.id));
      cursor = current.nextCursor ?? undefined;
      if (cursor !== undefined) {
        expect(cursor.length).toBeLessThanOrEqual(512);
        expect(decodeAgentCursor(cursor)).not.toBeNull();
      }
    } while (cursor !== undefined);
    expect(new Set(seen).size).toBe(agents.length);
  });

  it('accepts only the exact cursor format, which proves no origin', () => {
    const valid = { v: '0123456789abcdef', q: 'fedcba9876543210', o: 10 };
    expect(decodeAgentCursor(encodeAgentCursor(valid))).toEqual(valid);
    const json = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    for (const raw of [
      '',
      'not base64!',
      json([]),
      json({ name: 'zzzz', id: 'invented' }),
      json({ ...valid, extra: 1 }),
      json({ ...valid, v: 'XYZ' }),
      json({ ...valid, o: 0 }),
      json({ ...valid, o: 1.5 }),
      json({ ...valid, o: 201 }),
      'a'.repeat(513),
    ]) {
      expect(decodeAgentCursor(raw)).toBeNull();
    }
  });
});
