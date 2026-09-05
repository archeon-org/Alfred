import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(import.meta.dirname, '../../src');
const testFilePattern = /\.(?:spec|test)\.[cm]?[jt]sx?$/u;

async function findTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(absolutePath);
      return testFilePattern.test(entry.name) ? [path.relative(sourceRoot, absolutePath)] : [];
    }),
  );

  return nested.flat().sort();
}

async function findSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findSourceFiles(absolutePath);
      return /\.[jt]sx?$/u.test(entry.name) ? [absolutePath] : [];
    }),
  );

  return nested.flat().sort();
}

async function filesMatching(directory: string, pattern: RegExp): Promise<string[]> {
  const files = await findSourceFiles(directory);
  const matches = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      return pattern.test(source) ? [path.relative(sourceRoot, file)] : [];
    }),
  );

  return matches.flat().sort();
}

describe('frontend test topology', () => {
  it('keeps test files outside the production source tree', async () => {
    await expect(findTestFiles(sourceRoot)).resolves.toEqual([]);
  });

  it('keeps transport services independent from React', async () => {
    await expect(
      filesMatching(path.join(sourceRoot, 'services'), /from ['"]react/u),
    ).resolves.toEqual([]);
  });

  it('keeps direct network calls out of screens and components', async () => {
    const [screenViolations, componentViolations] = await Promise.all([
      filesMatching(path.join(sourceRoot, 'screens'), /\bfetch\s*\(/u),
      filesMatching(path.join(sourceRoot, 'components'), /\bfetch\s*\(/u),
    ]);

    expect([...screenViolations, ...componentViolations]).toEqual([]);
  });
});
