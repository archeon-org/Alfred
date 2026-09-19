import type { Mermaid, MermaidConfig } from 'mermaid';

/**
 * Configuration keys a diagram's own `%%{init}%%` directive or YAML front matter may never set.
 * Mermaid deletes them from a directive at every nesting level before applying it (`secure`), so
 * their spelling in the source (quoted keys, Unicode escapes) does not matter. They would put HTML
 * back into labels (hence `<img>`), inject CSS (`url(...)`, `@import`) or replace the app palette.
 * Mermaid's own list is kept in front.
 */
export const SECURE_CONFIG_KEYS: readonly string[] = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'altFontFamily',
  'dompurifyConfig',
  'fontFamily',
  'htmlLabels',
  'theme',
  'themeCSS',
  'themeVariables',
];

interface VertexLike {
  readonly img?: unknown;
}
type Vertex = readonly [id: string, vertex: VertexLike];
/** What `getDiagramFromText` resolves to; its database is typed per diagram, hence `unknown`. */
interface DiagramLike {
  readonly db?: unknown;
}

/** The vertices of a diagram whose database exposes them (flowcharts do), as a map or a record. */
function verticesOf(db: unknown): readonly Vertex[] {
  if (typeof db !== 'object' || db === null || !('getVertices' in db)) return [];
  const { getVertices } = db as { readonly getVertices?: unknown };
  if (typeof getVertices !== 'function') return [];
  const vertices: unknown = getVertices.call(db);
  if (vertices instanceof Map) return [...(vertices as ReadonlyMap<string, VertexLike>).entries()];
  if (typeof vertices === 'object' && vertices !== null) {
    return Object.entries(vertices as Readonly<Record<string, VertexLike>>);
  }
  return [];
}

export type DiagramResult =
  | { readonly svg: string }
  /** The identifiers of the nodes that would make the renderer load a resource. */
  | { readonly external: readonly string[] };

/**
 * Nodes of a parsed diagram that carry an image address. Mermaid's image shape fetches it while
 * measuring the node, before any output exists, and the address may be spelled in any YAML form
 * (`img:`, `"img":`, `'img':`, `"\u0069mg":`, a block scalar…): the parsed node, not the text,
 * is what decides. Icons are not loaded: no icon pack is registered, so they draw as the fallback.
 */
export function imageNodes(diagram: DiagramLike): readonly string[] {
  return verticesOf(diagram.db)
    .filter(([, vertex]) => typeof vertex.img === 'string' && vertex.img.trim() !== '')
    .map(([id]) => id);
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Inspects then draws a diagram as one unit of work. Mermaid keeps one database per diagram type
 * and parses into it: a second diagram parsed between the inspection and the drawing of the first
 * would be inspected in its place. Every diagram of the page goes through this queue.
 */
export function drawDiagram(
  mermaid: Mermaid,
  id: string,
  source: string,
  config: MermaidConfig,
): Promise<DiagramResult> {
  const task = async (): Promise<DiagramResult> => {
    mermaid.initialize({ ...config, secure: [...SECURE_CONFIG_KEYS] });
    const external = imageNodes(await mermaid.mermaidAPI.getDiagramFromText(source));
    if (external.length > 0) return { external };
    const { svg } = await mermaid.render(id, source);
    return { svg };
  };
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}
