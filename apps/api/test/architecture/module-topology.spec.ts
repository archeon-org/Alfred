import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRoot = process.cwd();
const authModuleRoot = path.join(apiRoot, 'src/modules/auth');
const sourceRoot = path.join(apiRoot, 'src');
const testRoot = path.join(apiRoot, 'test');
const testFilePattern = /\.(?:spec|test)\.[cm]?[jt]s$/u;

async function findTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      return testFilePattern.test(entry.name) ? [path.relative(apiRoot, entryPath)] : [];
    }),
  );

  return nested.flat().sort();
}

async function findTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTypeScriptFiles(entryPath);
      return entry.name.endsWith('.ts') ? [entryPath] : [];
    }),
  );

  return nested.flat().sort();
}

async function forbiddenImports(directory: string, pattern: RegExp): Promise<string[]> {
  const files = await findTypeScriptFiles(directory);
  const violations = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      return pattern.test(source) ? [path.relative(apiRoot, file)] : [];
    }),
  );

  return violations.flat().sort();
}

describe('API module topology', () => {
  it('keeps tests outside the production source tree', async () => {
    await expect(findTestFiles(sourceRoot)).resolves.toEqual([]);
  });

  it('uses explicit test-suite boundaries', async () => {
    const entries = await readdir(testRoot, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    expect(directories.sort()).toEqual([
      'architecture',
      'contract',
      'e2e',
      'integration',
      'support',
      'unit',
    ]);
  });

  it('keeps the auth feature split by responsibility', async () => {
    const entries = await readdir(authModuleRoot, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    expect(directories.sort()).toEqual(['api', 'application', 'domain', 'infrastructure']);
  });

  it('keeps auth application services independent from infrastructure adapters', async () => {
    await expect(
      forbiddenImports(path.join(authModuleRoot, 'application'), /from ['"][^'"]*infrastructure/u),
    ).resolves.toEqual([]);
  });

  it('keeps the auth domain free from NestJS, TypeORM and infrastructure runtime imports', async () => {
    await expect(
      forbiddenImports(
        path.join(authModuleRoot, 'domain'),
        /from ['"](?:@nestjs|typeorm|[^'"]*infrastructure)/u,
      ),
    ).resolves.toEqual([]);
  });
});
