/**
 * Small, dependency-free Markdown parser producing a typed tree. The renderer turns the tree into
 * React elements, so untrusted text is never injected as HTML. Supported: ATX headings, paragraphs
 * with soft/hard breaks, ordered and unordered lists, fenced code, block quotes, horizontal rules,
 * inline code, bold, italic and http(s)/mailto links.
 */
export type InlineNode =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'code'; readonly value: string }
  | { readonly type: 'break' }
  | { readonly type: 'strong'; readonly children: readonly InlineNode[] }
  | { readonly type: 'emphasis'; readonly children: readonly InlineNode[] }
  | { readonly type: 'link'; readonly href: string; readonly children: readonly InlineNode[] };

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type BlockNode =
  | {
      readonly type: 'heading';
      readonly level: HeadingLevel;
      readonly children: readonly InlineNode[];
    }
  | { readonly type: 'paragraph'; readonly children: readonly InlineNode[] }
  | {
      readonly type: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly InlineNode[])[];
    }
  | { readonly type: 'code'; readonly language: string | null; readonly value: string }
  | { readonly type: 'quote'; readonly children: readonly InlineNode[] }
  | { readonly type: 'rule' };

const FENCE = /^```([\w-]*)\s*$/u;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/u;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/u;
const LIST_ITEM = /^\s{0,3}(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/u;
const QUOTE = /^\s{0,3}>\s?(.*)$/u;
const SAFE_LINK = /^(?:https?:\/\/|mailto:)/iu;
const INLINE =
  /(`+)([^`]+?)\1|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*([^*\s](?:[^*]*?[^*\s])?)\*(?![\w*])|(?<![\w_])_([^_\s](?:[^_]*?[^_\s])?)_(?![\w_])|\[([^\]\n]+)\]\(([^)\s]+)\)/u;

export function parseInline(text: string): readonly InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (match === null || match.index === undefined) {
      pushText(nodes, rest);
      break;
    }
    if (match.index > 0) pushText(nodes, rest.slice(0, match.index));
    const [, , code, strong, strongAlt, emphasis, emphasisAlt, label, href] = match;
    if (code !== undefined) nodes.push({ type: 'code', value: code.trim() });
    else if (strong !== undefined || strongAlt !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(strong ?? strongAlt ?? '') });
    } else if (emphasis !== undefined || emphasisAlt !== undefined) {
      nodes.push({ type: 'emphasis', children: parseInline(emphasis ?? emphasisAlt ?? '') });
    } else if (label !== undefined && href !== undefined) {
      nodes.push(
        SAFE_LINK.test(href)
          ? { type: 'link', href, children: parseInline(label) }
          : { type: 'text', value: match[0] },
      );
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return nodes;
}

function pushText(nodes: InlineNode[], value: string): void {
  const lines = value.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      const previous = lines[index - 1] ?? '';
      nodes.push(previous.endsWith('  ') ? { type: 'break' } : { type: 'text', value: ' ' });
    }
    const trimmed = index > 0 ? line.trimStart() : line;
    const content = index < lines.length - 1 ? trimmed.replace(/\s+$/u, '') : trimmed;
    if (content.length > 0) nodes.push({ type: 'text', value: content });
  });
}

export function parseMarkdown(source: string): readonly BlockNode[] {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0)
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = FENCE.exec(line);
    if (fence !== null) {
      flushParagraph();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', language: fence[1] ? fence[1] : null, value: body.join('\n') });
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as HeadingLevel,
        children: parseInline(heading[2] ?? ''),
      });
      continue;
    }
    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item !== null) {
      flushParagraph();
      const ordered = item[2] !== undefined;
      const items: string[] = [item[3] ?? ''];
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? '';
        const nextItem = LIST_ITEM.exec(next);
        if (nextItem !== null && (nextItem[2] !== undefined) === ordered) {
          items.push(nextItem[3] ?? '');
        } else if (/^\s{2,}\S/u.test(next)) {
          items[items.length - 1] = `${items[items.length - 1]}\n${next.trim()}`;
        } else break;
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items: items.map(parseInline) });
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote !== null) {
      flushParagraph();
      const quoted: string[] = [quote[1] ?? ''];
      while (index + 1 < lines.length) {
        const next = QUOTE.exec(lines[index + 1] ?? '');
        if (next === null) break;
        quoted.push(next[1] ?? '');
        index += 1;
      }
      blocks.push({ type: 'quote', children: parseInline(quoted.join('\n')) });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

/** Plain-text projection used for previews and accessible summaries. */
export function markdownToText(source: string, maxLength = Number.POSITIVE_INFINITY): string {
  const text = parseMarkdown(source)
    .map((block) => {
      if (block.type === 'code') return block.value;
      if (block.type === 'rule') return '';
      if (block.type === 'list') return block.items.map(inlineToText).join(' ');
      return inlineToText(block.children);
    })
    .filter((part) => part.length > 0)
    .join(' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : text;
}

function inlineToText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.value;
        case 'break':
          return ' ';
        default:
          return inlineToText(node.children);
      }
    })
    .join('');
}
