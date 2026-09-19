import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalContentStore } from '@api/modules/files/infrastructure/storage/local-content.store';
import { describeContentStoreContract } from '../../../../../support/content-store-contract';

describe('local content store', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'alfred-content-'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describeContentStoreContract(() => new LocalContentStore(root));

  const pathOf = (contentId: string): string =>
    join(root, 'contents', contentId.slice(0, 2), contentId);

  it('lays files out under the same key as the bucket would', async () => {
    const contentId = randomUUID();

    await new LocalContentStore(root).put(contentId, Buffer.from('x'));

    expect(await readFile(pathOf(contentId), 'utf8')).toBe('x');
  });

  it('keeps files and directories private to the owner', async () => {
    const contentId = randomUUID();

    await new LocalContentStore(root).put(contentId, Buffer.from('x'));

    expect((await stat(pathOf(contentId))).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, 'contents'))).mode & 0o077).toBe(0);
  });

  it('leaves no staging file behind, on success or on a refused write', async () => {
    const store = new LocalContentStore(root);
    const contentId = randomUUID();
    await store.put(contentId, Buffer.from('premier'));
    await store.put(contentId, Buffer.from('second')).catch(() => undefined);

    const entries = await readdir(join(root, 'contents', contentId.slice(0, 2)));

    expect(entries.filter((entry) => entry.endsWith('.part'))).toEqual([]);
  });

  it('resolves a relative root against the working directory', () => {
    expect(new LocalContentStore('var/uploads').root).toBe(join(process.cwd(), 'var/uploads'));
  });

  it('reports a directory it cannot write to before any upload does', async () => {
    const locked = await mkdtemp(join(tmpdir(), 'alfred-locked-'));
    await chmod(locked, 0o500);
    try {
      await expect(new LocalContentStore(join(locked, 'uploads')).probe()).rejects.toMatchObject({
        code: 'storage_unreachable',
      });
    } finally {
      await chmod(locked, 0o700);
      await rm(locked, { recursive: true, force: true });
    }
  });

  it('raises a filesystem failure other than absence', async () => {
    const file = join(root, 'not-a-directory');
    await new LocalContentStore(root).put(randomUUID(), Buffer.from('x'));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'x');

    await expect(new LocalContentStore(file).get(randomUUID())).rejects.toMatchObject({
      code: 'ENOTDIR',
    });
  });
});
