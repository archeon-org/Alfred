import { AGENT_CATALOG_MAX_ITEMS, type AgentPage, type AgentSummary } from '@alfred/contracts';
import { createHash } from 'node:crypto';

/** The catalog as one immutable version: sorted once, with its search text folded once. */
export interface AgentCatalogSnapshot {
  readonly version: string;
  readonly entries: readonly { readonly agent: AgentSummary; readonly text: string }[];
}

export interface AgentSearchQuery {
  readonly search?: string;
  readonly cursor?: string;
  readonly limit: number;
}

/**
 * Where the next page starts, for one catalog version and one search. It carries no agent text,
 * so its size is fixed whatever the names; it is checked for format only, not for origin.
 */
interface AgentCursor {
  readonly v: string;
  readonly q: string;
  readonly o: number;
}

export type AgentPageResult =
  | { readonly kind: 'page'; readonly page: AgentPage }
  | { readonly kind: 'invalid_cursor' }
  | { readonly kind: 'catalog_changed' };

const fingerprint = /^[0-9a-f]{16}$/u;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** Case, accent and separator-insensitive text: `Base_React` and `base react` compare equal. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[_-]+/gu, ' ');
}

function terms(search: string | undefined): readonly string[] {
  return fold(search ?? '')
    .split(/\s+/u)
    .filter((term) => term !== '');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Case-insensitive name order, then exact name and identifier so every agent has one position. */
function compare(left: AgentSummary, right: AgentSummary): number {
  return (
    compareText(left.name.toLowerCase(), right.name.toLowerCase()) ||
    compareText(left.name, right.name) ||
    compareText(left.id, right.id)
  );
}

/** The version changes only when the listed content does, not when the cache merely expires. */
export function snapshotCatalog(agents: readonly AgentSummary[]): AgentCatalogSnapshot {
  const sorted = [...agents].sort(compare);
  const entries = sorted.map((agent) =>
    Object.freeze({
      agent,
      text: fold(
        [
          agent.name,
          agent.graphId,
          agent.shortDescription ?? '',
          agent.description ?? '',
          ...agent.tags,
        ].join('\n'),
      ),
    }),
  );
  return Object.freeze({
    version: digest(JSON.stringify(sorted)),
    entries: Object.freeze(entries),
  });
}

export function encodeAgentCursor(cursor: AgentCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Returns `null` unless the value has exactly the cursor format. */
export function decodeAgentCursor(raw: string): AgentCursor | null {
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(raw)) return null;
  try {
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.toString('base64url') !== raw) return null;
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    if (Object.keys(value).length !== 3 || !('v' in value) || !('q' in value) || !('o' in value)) {
      return null;
    }
    const { v, q, o } = value;
    if (typeof v !== 'string' || typeof q !== 'string' || !fingerprint.test(v)) return null;
    if (!fingerprint.test(q) || typeof o !== 'number' || !Number.isInteger(o)) return null;
    if (o < 1 || o > AGENT_CATALOG_MAX_ITEMS) return null;
    return { v, q, o };
  } catch {
    return null;
  }
}

/**
 * Filters and pages one catalog version. A cursor from another version is refused rather than
 * applied to changed content, so a reader restarts instead of seeing repeats or gaps.
 */
export function pageAgents(
  snapshot: AgentCatalogSnapshot,
  query: AgentSearchQuery,
): AgentPageResult {
  const wanted = terms(query.search);
  const searchKey = digest(wanted.join(' '));
  let offset = 0;
  if (query.cursor !== undefined) {
    const cursor = decodeAgentCursor(query.cursor);
    if (cursor === null || cursor.q !== searchKey) return { kind: 'invalid_cursor' };
    if (cursor.v !== snapshot.version) return { kind: 'catalog_changed' };
    offset = cursor.o;
  }
  const matching = snapshot.entries.filter(({ text }) =>
    wanted.every((term) => text.includes(term)),
  );
  const end = offset + query.limit;
  return {
    kind: 'page',
    page: {
      items: matching.slice(offset, end).map(({ agent }) => agent),
      nextCursor:
        end < matching.length
          ? encodeAgentCursor({ v: snapshot.version, q: searchKey, o: end })
          : null,
    },
  };
}
