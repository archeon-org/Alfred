import { describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import type { FileSettings } from '@api/modules/files/application/file-settings';
import {
  MessageAttachmentsService,
  type RuntimeContentPart,
} from '@api/modules/files/application/message-attachments.service';
import type { ArtifactContentStore } from '@api/modules/files/domain/content-store.port';
import { ArtifactEntity } from '@api/modules/files/infrastructure/persistence/artifact.entity';
import { MessageAttachmentEntity } from '@api/modules/files/infrastructure/persistence/message-attachment.entity';
import { FakeDb } from '../../../../support/fake-db';

const scope = { tenantId: 'tenant', ownerUserId: 'owner' };
const ids = Array.from({ length: 9 }, (_unused, index) => `artifact-${index}`);
const artifact = (id: string, overrides: Partial<ArtifactEntity> = {}) =>
  ({
    id,
    ...scope,
    name: `${id}.pdf`,
    kind: 'pdf',
    mediaType: 'application/pdf',
    sizeBytes: 12,
    currentRevisionId: `revision-${id}`,
    readiness: 'ready',
    ...overrides,
  }) as ArtifactEntity;

function fixture(enabled = true) {
  const db = new FakeDb();
  const store = {
    get: vi.fn<ArtifactContentStore['get']>().mockResolvedValue(Buffer.from('jpeg-bytes')),
  };
  const service = new MessageAttachmentsService(
    db.asDataSource(),
    store as unknown as ArtifactContentStore,
    { promptTokensPerDocument: 10, promptTokensPerExecution: 15 } as FileSettings,
    { isEnabled: () => enabled } as unknown as FeatureFlagsService,
  );
  return { db, store, service };
}

const row = (overrides: Record<string, unknown>) => ({
  artifact_id: 'a',
  name: 'Contrat.pdf',
  kind: 'pdf',
  available: true,
  text: null,
  page_count: null,
  extraction_truncated: false,
  derivative_content_id: null,
  derivative_media_type: null,
  ...overrides,
});

describe('MessageAttachmentsService', () => {
  it('binds nothing for an empty list', async () => {
    const { db, service } = fixture();

    await service.bind(db.manager, scope, 'message', []);

    expect(db.repository(ArtifactEntity).find).not.toHaveBeenCalled();
  });

  it('snapshots each file on the message, in order, pinned to its revision', async () => {
    const { db, service } = fixture();
    db.repository(ArtifactEntity).find.mockResolvedValue([artifact('b'), artifact('a')]);

    await service.bind(db.manager, scope, 'message', ['a', 'b', 'a']);

    expect(db.repository(MessageAttachmentEntity).save.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        messageId: 'message',
        artifactId: 'a',
        revisionId: 'revision-a',
        position: 0,
        name: 'a.pdf',
        delivery: null,
      }),
      expect.objectContaining({ artifactId: 'b', position: 1 }),
    ]);
  });

  it('refuses too many files, a missing or foreign file, a file not ready, too many images', async () => {
    const { db, service } = fixture();
    await expect(service.bind(db.manager, scope, 'message', ids)).rejects.toMatchObject({
      code: 'attachment_limit_reached',
    });

    db.repository(ArtifactEntity).find.mockResolvedValue([artifact('a')]);
    await expect(service.bind(db.manager, scope, 'message', ['a', 'b'])).rejects.toMatchObject({
      code: 'attachment_not_found',
      status: 404,
    });

    db.repository(ArtifactEntity).find.mockResolvedValue([
      artifact('a', { readiness: 'processing' }),
    ]);
    await expect(service.bind(db.manager, scope, 'message', ['a'])).rejects.toMatchObject({
      code: 'attachment_not_ready',
      status: 409,
    });

    const images = ids.slice(0, 5).map((id) => artifact(id, { kind: 'image' }));
    db.repository(ArtifactEntity).find.mockResolvedValue(images);
    await expect(service.bind(db.manager, scope, 'message', ids.slice(0, 5))).rejects.toMatchObject(
      { code: 'attachment_limit_reached' },
    );
    expect(db.repository(MessageAttachmentEntity).save).not.toHaveBeenCalled();
  });

  it('groups the attachments of several messages and marks deleted files', async () => {
    const { db, service } = fixture();
    db.when(/FROM "api_message_attachments" a JOIN "api_artifacts" f/u, [
      {
        message_id: 'm1',
        artifact_id: 'a',
        name: 'A.pdf',
        kind: 'pdf',
        media_type: 'application/pdf',
        size_bytes: 10,
        delivery: 'text',
        truncated: true,
        available: true,
      },
      {
        message_id: 'm1',
        artifact_id: 'b',
        name: 'B.png',
        kind: 'image',
        media_type: 'image/png',
        size_bytes: 20,
        delivery: 'image',
        truncated: false,
        available: false,
      },
    ]);

    const grouped = await service.forMessages(['m1', 'm2']);

    expect(grouped.get('m1')).toEqual([
      expect.objectContaining({ fileId: 'a', delivery: 'text', truncated: true, available: true }),
      expect.objectContaining({ fileId: 'b', name: 'B.png', available: false }),
    ]);
    expect(grouped.has('m2')).toBe(false);
    expect(await service.forMessages([])).toEqual(new Map());
  });

  it('reads the files of one turn from its message identifier', async () => {
    const { db, service } = fixture();
    await expect(service.forMessage('m1')).resolves.toEqual([]);
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('does nothing at all while the capability is off, whatever route the request took', async () => {
    const { db, store, service } = fixture(false);
    db.repository(ArtifactEntity).find.mockResolvedValue([artifact('a')]);

    // The executions route is guarded by another capability: the gate has to be here.
    await expect(service.bind(db.manager, scope, 'message', ['a'])).rejects.toMatchObject({
      status: 404,
    });
    expect(db.repository(ArtifactEntity).find).not.toHaveBeenCalled();
    expect(db.repository(MessageAttachmentEntity).save).not.toHaveBeenCalled();

    await expect(service.forMessages(['m1'])).resolves.toEqual(new Map());
    await expect(service.runtimeContent('execution', 'Bonjour')).resolves.toBe('Bonjour');
    expect(db.query).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();

    // A composition without the flag registry has no upload capability either.
    const unregistered = new MessageAttachmentsService(
      db.asDataSource(),
      store as unknown as ArtifactContentStore,
      {} as FileSettings,
    );
    await expect(unregistered.bind(db.manager, scope, 'message', ['a'])).rejects.toMatchObject({
      status: 404,
    });
  });

  it('holds the files against a concurrent deletion while it attaches them', async () => {
    const { db, service } = fixture();
    db.repository(ArtifactEntity).find.mockResolvedValue([artifact('a')]);

    await service.bind(db.manager, scope, 'message', ['a']);

    expect(db.repository(ArtifactEntity).find.mock.calls[0]?.[0]).toMatchObject({
      lock: { mode: 'pessimistic_read' },
    });
  });

  it('leaves a message without attachments as plain text', async () => {
    const { db, service } = fixture();
    await expect(service.runtimeContent('execution', 'Bonjour')).resolves.toBe('Bonjour');

    db.when(/FROM "api_messages" WHERE "execution_id"/u, [{ id: 'm1' }]);
    await expect(service.runtimeContent('execution', 'Bonjour')).resolves.toBe('Bonjour');
  });

  it('sends text as bounded evidence and an image as a data URL, and records both', async () => {
    const { db, store, service } = fixture();
    db.when(/FROM "api_messages" WHERE "execution_id"/u, [{ id: 'm1' }]).when(
      /LEFT JOIN "api_artifact_extractions" e/u,
      [
        row({ artifact_id: 'doc', text: 'x'.repeat(100), page_count: 4 }),
        row({
          artifact_id: 'pic',
          name: 'schema.png',
          kind: 'image',
          derivative_content_id: 'reduced',
          derivative_media_type: 'image/jpeg',
        }),
      ],
    );

    const content = (await service.runtimeContent(
      'execution',
      'Résume',
    )) as readonly RuntimeContentPart[];

    expect(content.map((part) => part.type)).toEqual(['text', 'text', 'image_url']);
    expect(content[0]).toEqual({ type: 'text', text: 'Résume' });
    expect((content[1] as { text: string }).text).toContain('truncated="true"');
    expect(content[2]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}` },
    });
    expect(store.get.mock.calls[0]?.[0]).toBe('reduced');

    const updates = db.repository(MessageAttachmentEntity).update.mock.calls;
    expect(updates).toEqual([
      [
        { messageId: 'm1', artifactId: 'pic' },
        { delivery: 'image', deliveredChars: null, truncated: false },
      ],
      [
        { messageId: 'm1', artifactId: 'doc' },
        { delivery: 'text', deliveredChars: 40, truncated: true },
      ],
    ]);
  });

  it('delivers nothing for a deleted file, an unread document or a missing reduced copy', async () => {
    const { db, store, service } = fixture();
    store.get.mockResolvedValue(null);
    db.when(/FROM "api_messages" WHERE "execution_id"/u, [{ id: 'm1' }]).when(
      /LEFT JOIN "api_artifact_extractions" e/u,
      [
        row({ artifact_id: 'deleted', available: false, text: 'secret' }),
        row({ artifact_id: 'unread' }),
        row({ artifact_id: 'pic', kind: 'image', derivative_content_id: 'reduced' }),
        row({ artifact_id: 'no-copy', kind: 'image' }),
      ],
    );

    const content = await service.runtimeContent('execution', '');

    // A message of files only tells the model so, instead of inventing the user's words.
    expect(content).toEqual([
      { type: 'text', text: 'L’utilisateur a joint des fichiers sans écrire de message.' },
    ]);
    expect(
      db
        .repository(MessageAttachmentEntity)
        .update.mock.calls.map(([, changes]) => (changes as { delivery: string }).delivery),
    ).toEqual(['unavailable', 'unavailable', 'unavailable', 'unavailable']);
  });

  const pictures = (count: number) =>
    Array.from({ length: count }, (_unused, index) =>
      row({
        artifact_id: `pic-${index}`,
        kind: 'image',
        derivative_content_id: `reduced-${index}`,
        derivative_media_type: 'image/jpeg',
      }),
    );

  it('reads the images of a turn together, not one after the other', async () => {
    const { db, store, service } = fixture();
    const release: (() => void)[] = [];
    store.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          release.push(() => {
            resolve(Buffer.from('jpeg'));
          });
        }),
    );
    db.when(/FROM "api_messages" WHERE "execution_id"/u, [{ id: 'm1' }]).when(
      /LEFT JOIN "api_artifact_extractions" e/u,
      pictures(4),
    );

    const content = service.runtimeContent('execution', 'Regarde');
    await vi.waitFor(() => {
      // All four reads are in flight before any of them has answered.
      expect(store.get).toHaveBeenCalledTimes(4);
    });
    release.forEach((answer) => {
      answer();
    });

    await expect(content).resolves.toHaveLength(5);
  });

  it('gives up on a store that does not answer, and sends the turn without the image', async () => {
    vi.useFakeTimers();
    try {
      const { db, store, service } = fixture();
      store.get.mockImplementation(
        (_id, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      );
      db.when(/FROM "api_messages" WHERE "execution_id"/u, [{ id: 'm1' }]).when(
        /LEFT JOIN "api_artifact_extractions" e/u,
        pictures(2),
      );

      const content = service.runtimeContent('execution', 'Regarde');
      await vi.advanceTimersByTimeAsync(15_100);

      await expect(content).resolves.toEqual([{ type: 'text', text: 'Regarde' }]);
      expect(
        db
          .repository(MessageAttachmentEntity)
          .update.mock.calls.map(([, changes]) => (changes as { delivery: string }).delivery),
      ).toEqual(['unavailable', 'unavailable']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops at once when the execution itself is cancelled', async () => {
    const { db, store, service } = fixture();
    const cancellation = new AbortController();
    store.get.mockImplementation((_id, options) => {
      expect(options?.signal).toBeDefined();
      cancellation.abort();
      return Promise.reject(new Error('aborted'));
    });
    db.when(/FROM "api_messages" WHERE "execution_id"/u, [{ id: 'm1' }]).when(
      /LEFT JOIN "api_artifact_extractions" e/u,
      pictures(1),
    );

    await expect(
      service.runtimeContent('execution', 'Regarde', cancellation.signal),
    ).rejects.toThrow('aborted');
    expect(db.repository(MessageAttachmentEntity).update).not.toHaveBeenCalled();
  });
});
