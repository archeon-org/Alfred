import { describe, expect, it } from 'vitest';

import { markdownToText, parseInline, parseMarkdown } from '@/lib/markdown/parse-markdown';

describe('parseMarkdown', () => {
  it('splits headings, paragraphs, rules and quotes', () => {
    expect(
      parseMarkdown('# Titre ##\n\nUn paragraphe\nsur deux lignes.\n\n---\n> Citation\n> suite'),
    ).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', value: 'Titre' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Un paragraphe' },
          { type: 'text', value: ' ' },
          { type: 'text', value: 'sur deux lignes.' },
        ],
      },
      { type: 'rule' },
      {
        type: 'quote',
        children: [
          { type: 'text', value: 'Citation' },
          { type: 'text', value: ' ' },
          { type: 'text', value: 'suite' },
        ],
      },
    ]);
  });

  it('keeps hard breaks, lists with continuation lines and fenced code verbatim', () => {
    const blocks = parseMarkdown(
      'ligne  \nsuite\n\n- un\n- deux\n  encore\n1. premier\n2) second\n\n```ts\nconst a = 1;\n\n# pas un titre\n```',
    );
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', value: 'ligne' },
        { type: 'break' },
        { type: 'text', value: 'suite' },
      ],
    });
    expect(blocks[1]).toEqual({
      type: 'list',
      ordered: false,
      items: [
        [{ type: 'text', value: 'un' }],
        [
          { type: 'text', value: 'deux' },
          { type: 'text', value: ' ' },
          { type: 'text', value: 'encore' },
        ],
      ],
    });
    expect(blocks[2]).toEqual({
      type: 'list',
      ordered: true,
      items: [[{ type: 'text', value: 'premier' }], [{ type: 'text', value: 'second' }]],
    });
    expect(blocks[3]).toEqual({
      type: 'code',
      language: 'ts',
      value: 'const a = 1;\n\n# pas un titre',
    });
  });

  it('normalizes Windows line endings and closes an unterminated fence', () => {
    expect(parseMarkdown('a\r\nb\r\n\r\n```\nx')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'a' },
          { type: 'text', value: ' ' },
          { type: 'text', value: 'b' },
        ],
      },
      { type: 'code', language: null, value: 'x' },
    ]);
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n\n')).toEqual([]);
  });

  it('strips a closing hash sequence only after whitespace', () => {
    expect(parseMarkdown('## C# ##')).toEqual([
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'C#' }] },
    ]);
    expect(parseMarkdown('# C#')).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', value: 'C#' }] },
    ]);
    expect(parseMarkdown('# ###')).toEqual([{ type: 'heading', level: 1, children: [] }]);
  });

  // A project context holds up to 64 KiB; a hostile document must never freeze the interface.
  it.each<[string, string]>([
    ['backticks', '`'.repeat(64_000)],
    ['backticks with text', '`a'.repeat(32_000)],
    ['opening brackets', '['.repeat(64_000)],
    ['bracket labels', '[a'.repeat(32_000)],
    ['asterisks', ' *a'.repeat(20_000)],
    ['underscores', ' _a'.repeat(20_000)],
    ['heading padding', `# a${' '.repeat(30_000)}#b`],
    ['trailing spaces', `a${' '.repeat(60_000)}b\nc`],
    ['unterminated strong', `**${'a'.repeat(64_000)}`],
    ['unterminated link', `[a](${'b'.repeat(64_000)}`],
  ])('parses %s of the maximum document size in linear time', (_name, source) => {
    const start = performance.now();
    parseMarkdown(source);
    markdownToText(source, 160);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('parseInline', () => {
  it('handles code, emphasis, strong and nesting', () => {
    expect(parseInline('du `code` **gras *et* fort** _souligné_ __aussi__')).toEqual([
      { type: 'text', value: 'du ' },
      { type: 'code', value: 'code' },
      { type: 'text', value: ' ' },
      {
        type: 'strong',
        children: [
          { type: 'text', value: 'gras ' },
          { type: 'emphasis', children: [{ type: 'text', value: 'et' }] },
          { type: 'text', value: ' fort' },
        ],
      },
      { type: 'text', value: ' ' },
      { type: 'emphasis', children: [{ type: 'text', value: 'souligné' }] },
      { type: 'text', value: ' ' },
      { type: 'strong', children: [{ type: 'text', value: 'aussi' }] },
    ]);
    expect(parseInline('snake_case_name et 2*3*4')).toEqual([
      { type: 'text', value: 'snake_case_name et 2*3*4' },
    ]);
  });

  it('accepts http(s) and mailto links only and keeps anything else as text', () => {
    expect(
      parseInline('[doc](https://alfred.test/x) [mail](mailto:a@b.c) [bad](javascript:alert)'),
    ).toEqual([
      { type: 'link', href: 'https://alfred.test/x', children: [{ type: 'text', value: 'doc' }] },
      { type: 'text', value: ' ' },
      { type: 'link', href: 'mailto:a@b.c', children: [{ type: 'text', value: 'mail' }] },
      { type: 'text', value: ' ' },
      { type: 'text', value: '[bad](javascript:alert)' },
    ]);
  });
});

describe('markdownToText', () => {
  it('flattens a document to one line and truncates on demand', () => {
    const source = '# Cap\n\nPenser la **prochaine** version.\n\n- a\n- b\n\n```\ncode\n```\n---';
    expect(markdownToText(source)).toBe('Cap Penser la prochaine version. a b code');
    expect(markdownToText(source, 12)).toBe('Cap Penser…');
    expect(markdownToText('')).toBe('');
  });
});
