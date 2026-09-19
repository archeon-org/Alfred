import type { Node, Parent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm);

/** Containers whose children form one run of text; every other container separates its children. */
const INLINE_CONTAINERS = new Set([
  'paragraph',
  'heading',
  'emphasis',
  'strong',
  'delete',
  'link',
  'linkReference',
  'tableCell',
]);

/** Words of one block, in reading order: text and code verbatim, everything else transparent. */
function blockText(node: Node): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if (node.type === 'break') return ' ';
  if (!('children' in node)) return '';
  const parts = (node as Parent).children.map(blockText);
  return parts.join(INLINE_CONTAINERS.has(node.type) ? '' : ' ');
}

/**
 * Flattens a Markdown document to one line of plain text for summaries and previews. Blocks are
 * joined by single spaces; the result is cut on a character budget with an ellipsis.
 */
export function markdownToText(source: string, maxLength = Number.POSITIVE_INFINITY): string {
  const root = parser.parse(source);
  const text = root.children
    .map(blockText)
    .filter((part) => part.length > 0)
    .join(' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : text;
}
