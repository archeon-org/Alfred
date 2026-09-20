import { createHash, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { S3ContentStore } from '@api/modules/files/infrastructure/storage/s3-content.store';
import { describeContentStoreContract } from '../../../../../support/content-store-contract';
import { FakeS3, FakeS3Error } from '../../../../../support/fake-s3';

const settings = { bucket: 'alfred-files', prefix: '' } as const;

describe('S3-compatible content store', () => {
  describeContentStoreContract(() => new S3ContentStore(new FakeS3(), settings));

  it('writes to the bucket under the shared key layout, with an integrity header', async () => {
    const service = new FakeS3();
    const contentId = randomUUID();
    const bytes = Buffer.from('x');

    await new S3ContentStore(service, settings).put(contentId, bytes, {
      mediaType: 'application/pdf',
    });

    expect(service.inputFor('PutObjectCommand')).toMatchObject({
      Bucket: 'alfred-files',
      Key: `contents/${contentId.slice(0, 2)}/${contentId}`,
      ContentType: 'application/pdf',
      ContentLength: 1,
      ContentMD5: createHash('md5').update(bytes).digest('base64'),
    });
  });

  it('places every key under the configured prefix', async () => {
    const service = new FakeS3();
    const contentId = randomUUID();

    await new S3ContentStore(service, { bucket: 'alfred-files', prefix: 'alfred/prod' }).put(
      contentId,
      Buffer.from('x'),
      { mediaType: 'text/plain' },
    );

    expect(String(service.inputFor('PutObjectCommand')?.Key)).toBe(
      `alfred/prod/contents/${contentId.slice(0, 2)}/${contentId}`,
    );
  });

  it('does not write again when the same bytes are already stored', async () => {
    const service = new FakeS3();
    const store = new S3ContentStore(service, settings);
    const contentId = randomUUID();
    await store.put(contentId, Buffer.from('x'), { mediaType: 'text/plain' });

    await store.put(contentId, Buffer.from('x'), { mediaType: 'text/plain' });

    expect(service.commands.filter((command) => command.name === 'PutObjectCommand')).toHaveLength(
      1,
    );
  });

  it('raises a missing bucket instead of reading it as absent content', async () => {
    const store = new S3ContentStore(new FakeS3({ bucketExists: false }), settings);

    await expect(store.get(randomUUID())).rejects.toMatchObject({ name: 'NoSuchBucket' });
    await expect(store.delete(randomUUID())).rejects.toMatchObject({ name: 'NoSuchBucket' });
    await expect(store.probe()).rejects.toMatchObject({ code: 'storage_unreachable' });
  });

  it.each(['get', 'exists', 'delete'] as const)(
    'raises a forbidden %s rather than reporting absence',
    async (operation) => {
      const denied = {
        send: (): Promise<never> => Promise.reject(new FakeS3Error('AccessDenied', 403)),
      };

      await expect(new S3ContentStore(denied, settings)[operation](randomUUID())).rejects.toThrow(
        'AccessDenied',
      );
    },
  );

  it('raises a response without a readable body', async () => {
    const hollow = { send: (): Promise<unknown> => Promise.resolve({}) };

    await expect(new S3ContentStore(hollow, settings).get(randomUUID())).rejects.toMatchObject({
      code: 'storage_unreachable',
    });
  });

  it('forwards the caller abort signal to the provider request', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const recording = {
      send: (_command: object, options?: { abortSignal?: AbortSignal }): Promise<unknown> => {
        seen.push(options?.abortSignal);
        return Promise.resolve({});
      },
    };
    const signal = new AbortController().signal;

    await new S3ContentStore(recording, settings).delete(randomUUID(), { signal });

    expect(seen).toEqual([signal]);
  });

  it('releases the client at shutdown', async () => {
    const service = new FakeS3();

    await new S3ContentStore(service, settings).close();

    expect(service.destroyed).toBe(true);
  });
});
