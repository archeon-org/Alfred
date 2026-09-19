import { describe, expect, it } from 'vitest';

import { markdownToText } from '@/lib/markdown/markdown-text';

describe('markdownToText', () => {
  it('flattens a document to one line and truncates on demand', () => {
    const source = '# Cap\n\nPenser la **prochaine** version.\n\n- a\n- b\n\n```\ncode\n```\n---';
    expect(markdownToText(source)).toBe('Cap Penser la prochaine version. a b code');
    expect(markdownToText(source, 12)).toBe('Cap Penser…');
    expect(markdownToText('')).toBe('');
  });

  it('reads table cells, task items and links as plain words', () => {
    expect(
      markdownToText('| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] fait\n\n[site](https://x.test)'),
    ).toBe('a b 1 2 fait site');
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
    ['table cells', `| a |${' b |'.repeat(10_000)}\n|${' - |'.repeat(10_001)}`],
  ])('parses %s of the maximum document size in bounded time', (_name, source) => {
    const start = performance.now();
    markdownToText(source, 160);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
