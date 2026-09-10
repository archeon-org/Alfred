import { describe, expect, it } from 'vitest';
import {
  normalizeContextContent,
  nextContextRevision,
  contextFingerprint,
} from '@api/modules/context/domain/context-document';

describe('context document rules', () => {
  it('normalizes line endings without trimming meaningful whitespace', () => {
    expect(normalizeContextContent('  # Hi\r\nText\rEnd  ', 100)).toBe('  # Hi\nText\nEnd  ');
  });
  it('bounds UTF8 bytes and rejects NUL and unpaired surrogates', () => {
    expect(() => normalizeContextContent('éé', 3)).toThrow();
    expect(() => normalizeContextContent('a\0b', 100)).toThrow();
    expect(() => normalizeContextContent('\ud800', 100)).toThrow();
    expect(normalizeContextContent('éé', 4)).toBe('éé');
  });
  it('checks revision before treating equal content as idempotent', () => {
    expect(() => nextContextRevision({ content: 'same', revision: 2 }, 'same', 1)).toThrow();
    expect(nextContextRevision({ content: 'same', revision: 2 }, 'same', 2)).toBe(2);
  });
  it('creates at zero and retains monotone revisions across reset', () => {
    expect(nextContextRevision(null, 'first', 0)).toBe(1);
    expect(() => nextContextRevision(null, 'first', 1)).toThrow();
    expect(nextContextRevision({ content: 'first', revision: 1 }, '', 1)).toBe(2);
    expect(nextContextRevision({ content: '', revision: 2 }, 'first', 2)).toBe(3);
  });
  it('fingerprints scope and revision, not just identical content', () => {
    const base = [
      { scope: 'project', scopeId: 'one', kind: 'context', revision: 1, contentHash: 'hash' },
    ];
    expect(contextFingerprint(base)).not.toBe(
      contextFingerprint([{ ...base[0]!, scopeId: 'two' }]),
    );
    expect(contextFingerprint(base)).not.toBe(contextFingerprint([{ ...base[0]!, revision: 2 }]));
  });
});
