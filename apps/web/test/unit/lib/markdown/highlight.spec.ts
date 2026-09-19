import { describe, expect, it } from 'vitest';

import { grammarFor, highlight, HIGHLIGHT_SOURCE_LIMIT } from '@/lib/markdown/highlight';

describe('code highlighting', () => {
  it('maps fence labels and aliases to bundled grammars', () => {
    expect(grammarFor('ts')).toBe('typescript');
    expect(grammarFor('TypeScript')).toBe('typescript');
    expect(grammarFor('sh')).toBe('bash');
    expect(grammarFor('py')).toBe('python');
    expect(grammarFor('brainfuck')).toBeNull();
    expect(grammarFor(null)).toBeNull();
  });

  it('tokenises with colours expressed as theme variables, line by line', async () => {
    const lines = await highlight('const total = rows.length;\nreturn total;', 'ts');
    expect(lines).not.toBeNull();
    expect(lines).toHaveLength(2);
    const keyword = lines![0]!.find((token) => token.content === 'const');
    expect(keyword?.color).toBe('var(--shiki-token-keyword)');
    expect(lines![0]!.map((token) => token.content).join('')).toBe('const total = rows.length;');
  });

  it('stays plain for unknown languages and oversized sources', async () => {
    expect(await highlight('x', 'brainfuck')).toBeNull();
    expect(await highlight('x'.repeat(HIGHLIGHT_SOURCE_LIMIT + 1), 'ts')).toBeNull();
  });
});
