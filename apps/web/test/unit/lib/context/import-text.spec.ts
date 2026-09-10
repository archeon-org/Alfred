import { describe, expect, it } from 'vitest';
import { readContextFile } from '@/lib/context/import-text';

function file(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
  };
}

describe('Context text import', () => {
  it('reads UTF-8 Markdown and normalizes line endings without retaining file metadata', async () => {
    expect(
      await readContextFile(file('Notes.MD', new TextEncoder().encode('# Équipe\r\nBonjour')), 64),
    ).toBe('# Équipe\nBonjour');
  });
  it('rejects unsupported files, oversized multibyte content, malformed UTF-8 and NUL', async () => {
    await expect(readContextFile(file('notes.pdf', new Uint8Array()), 64)).rejects.toThrow(
      'Markdown',
    );
    await expect(
      readContextFile(file('notes.txt', new TextEncoder().encode('éé')), 3),
    ).rejects.toThrow('limite');
    await expect(readContextFile(file('notes.txt', new Uint8Array([0xff])), 64)).rejects.toThrow(
      'UTF-8',
    );
    await expect(readContextFile(file('notes.md', new Uint8Array([0])), 64)).rejects.toThrow('nul');
  });
});
