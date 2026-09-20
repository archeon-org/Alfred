import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthPrincipal } from '@api/common/auth/auth-principal';
import { ConversationsService } from '@api/modules/conversations/application/conversations.service';
import { ExecutionsService } from '@api/modules/executions/application/executions.service';
import { MessageAttachmentsService } from '@api/modules/files/application/message-attachments.service';
import { TenantsService } from '@api/modules/tenants/tenants.service';
import { pdfWithText } from '../../../support/file-fixtures';
import { FilesPostgresFixture } from './files-postgres.fixture';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

/**
 * Races found by review, each forced into its harmful interleaving with a barrier instead of
 * being left to chance: a test that only passes when the scheduler is kind proves nothing.
 */
suite.sequential('file library under concurrency PostgreSQL', () => {
  const fixture = new FilesPostgresFixture();
  let executions: ExecutionsService;
  let attachments: MessageAttachmentsService;

  beforeAll(async () => {
    await fixture.start(url!);
    attachments = fixture.app.get(MessageAttachmentsService);
    executions = new ExecutionsService(
      fixture.db,
      fixture.app.get(TenantsService, { strict: false }),
      fixture.app.get(ConversationsService, { strict: false }),
      undefined,
      attachments,
    );
  });
  afterAll(async () => {
    await fixture.close();
  });

  const principal = (id: string): AuthPrincipal => ({ id }) as AuthPrincipal;
  /** A real barrier: true once some session waits for a row lock another one holds. */
  const someoneWaitsForARow = async (): Promise<boolean> => {
    const [row] = await fixture.db.query<{ waiting: number }[]>(
      `SELECT count(*)::int AS waiting FROM pg_locks
       WHERE NOT granted AND locktype IN ('transactionid', 'tuple')`,
    );
    return (row?.waiting ?? 0) > 0;
  };
  const contentsOf = (ownerId: string) =>
    fixture.db.query<{ id: string; role: string; state: string }[]>(
      `SELECT "id", "role", "state" FROM "api_artifact_contents" WHERE "owner_user_id" = $1 ORDER BY "role"`,
      [ownerId],
    );

  it('keeps the file alive when two requests carry one upload identity', async () => {
    const owner = await fixture.user();
    const bytes = pdfWithText('double clic');
    const uploadId = randomUUID();
    // Both requests are admitted on the same content before either of them publishes.
    const restore = fixture.holdWritesUntil(2);

    const [first, second] = await Promise.all([
      fixture.upload(owner.token, bytes, 'double.pdf', { uploadId }),
      fixture.upload(owner.token, bytes, 'double.pdf', { uploadId }),
    ]).finally(restore);

    expect([first.status, second.status]).toEqual([201, 201]);
    const fileId = (first.body?.data as { file: { id: string } }).file.id;
    expect((second.body?.data as { file: { id: string } }).file.id).toBe(fileId);
    expect([first.body?.data?.deduplicated, second.body?.data?.deduplicated]).toEqual([
      false,
      false,
    ]);

    // One content, still `ready`: the second request must not have read it as a duplicate.
    const contents = (await contentsOf(owner.id)).filter((row) => row.role === 'original');
    expect(contents).toHaveLength(1);
    expect(contents[0]?.state).toBe('ready');

    await fixture.collect();
    expect(await fixture.stored(String(contents[0]?.id))).toBe(true);
    const download = await fixture.raw(`/files/${fileId}/content`, owner.token);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  });

  it('keeps one entry when the same bytes arrive twice at once under different identities', async () => {
    const owner = await fixture.user();
    const bytes = pdfWithText('même contenu');
    const restore = fixture.holdWritesUntil(2);

    const results = await Promise.all([
      fixture.upload(owner.token, bytes, 'un.pdf'),
      fixture.upload(owner.token, bytes, 'deux.pdf'),
    ]).finally(restore);

    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results.map((result) => result.body?.data?.deduplicated).sort()).toEqual([false, true]);
    const ids = new Set(
      results.map((result) => (result.body?.data as { file: { id: string } }).file.id),
    );
    expect(ids.size).toBe(1);

    // The loser's copy is unreferenced and collected; the winner's bytes stay.
    await fixture.collect();
    const contents = (await contentsOf(owner.id)).filter((row) => row.role === 'original');
    expect(contents.map((row) => row.state).sort()).toEqual(['purged', 'ready']);
    const kept = contents.find((row) => row.state === 'ready');
    expect(await fixture.stored(String(kept?.id))).toBe(true);
  });

  it('publishes nothing for an upload whose browser left while the bytes were written', async () => {
    const owner = await fixture.user();
    // The write is held, and tells the test when the API has seen its client leave.
    const store = fixture.store;
    const put = store.put.bind(store);
    let seen: AbortSignal | undefined;
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    store.put = async (contentId, bytes, options) => {
      seen = options.signal;
      await gate;
      return put(contentId, bytes, options);
    };
    const restore = () => {
      store.put = put;
      open();
    };
    const leaving = new AbortController();
    const form = new FormData();
    form.set('uploadId', randomUUID());
    form.set('file', new Blob([new Uint8Array(pdfWithText('abandonné'))]), 'abandon.pdf');

    const request = fetch(`${fixture.url}/files`, {
      method: 'POST',
      body: form,
      headers: { authorization: `Bearer ${owner.token}` },
      signal: leaving.signal,
    });
    // The request is held inside the store write: this is when the user cancels.
    await expect
      .poll(async () => (await contentsOf(owner.id)).map((row) => row.state))
      .toEqual(['pending']);
    leaving.abort();
    await expect(request).rejects.toThrow();
    await expect.poll(() => seen?.aborted).toBe(true);
    restore();

    await expect
      .poll(async () => (await contentsOf(owner.id)).map((row) => row.state))
      .toEqual(['failed']);
    const listed = await fixture.api('GET', '/files', owner.token);
    expect(listed.body?.data?.items).toEqual([]);
    const quota = await fixture.api('GET', '/files/quota', owner.token);
    expect(quota.body?.data).toMatchObject({ usedBytes: 0, reservedBytes: 0 });
  });

  it('makes a deletion wait for an attachment in progress, then refuses it', async () => {
    const owner = await fixture.user();
    const conversationId = await fixture.conversation(owner.token);
    const file = await fixture.uploaded(owner.token, pdfWithText('contesté'), 'conteste.pdf');
    await fixture.extractAll();

    // Hold the transaction that attaches the file open, after it has read and locked the row.
    const bind = attachments.bind.bind(attachments);
    let release: () => void = () => undefined;
    let attached: () => void = () => undefined;
    const reachedBind = new Promise<void>((resolve) => {
      attached = resolve;
    });
    attachments.bind = async (...parameters: Parameters<MessageAttachmentsService['bind']>) => {
      await bind(...parameters);
      attached();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    try {
      const sending = executions.start(principal(owner.id), conversationId, 'Analyse', {
        submissionId: randomUUID(),
        profile: 'snapshot-v1',
        attachmentIds: [file.id],
      });
      await reachedBind;

      let deleted: { status: number } | undefined;
      const deletion = fixture.api('DELETE', `/files/${file.id}`, owner.token).then((result) => {
        deleted = result;
        return result;
      });
      // The deletion is blocked on the row the attachment holds: it has not answered.
      await expect.poll(someoneWaitsForARow).toBe(true);
      expect(deleted).toBeUndefined();

      release();
      await sending;
      const result = await deletion;
      expect([result.status, result.body?.error?.code]).toEqual([409, 'file_in_use']);
    } finally {
      attachments.bind = bind;
      release();
    }

    // The execution was accepted with a file that is still there.
    const [message] = await executions.listMessages(principal(owner.id), conversationId);
    expect(message?.attachments).toEqual([
      expect.objectContaining({ fileId: file.id, available: true }),
    ]);
  });

  it('never attaches a file whose deletion commits while the attachment waits for it', async () => {
    const owner = await fixture.user();
    const conversationId = await fixture.conversation(owner.token);
    const file = await fixture.uploaded(owner.token, pdfWithText('supprimé'), 'supprime.pdf');
    await fixture.extractAll();

    // The deletion holds the row and has not committed yet, exactly as `FilesService.remove`.
    const deletion = fixture.db.createQueryRunner();
    await deletion.connect();
    await deletion.startTransaction();
    try {
      await deletion.query(`SELECT 1 FROM "api_artifacts" WHERE "id" = $1 FOR UPDATE`, [file.id]);
      await deletion.query(`UPDATE "api_artifacts" SET "deleted_at" = now() WHERE "id" = $1`, [
        file.id,
      ]);

      const sending = executions
        .start(principal(owner.id), conversationId, 'Analyse', {
          submissionId: randomUUID(),
          profile: 'snapshot-v1',
          attachmentIds: [file.id],
        })
        .then(
          () => ({ accepted: true }),
          (error: unknown) => ({ accepted: false, error }),
        );
      // Without FOR SHARE the attachment would not wait here: it would read the row as it was
      // before the deletion, and the turn would be accepted with a file that no longer exists.
      await expect.poll(someoneWaitsForARow).toBe(true);
      await deletion.commitTransaction();

      expect(await sending).toMatchObject({
        accepted: false,
        error: { status: 404, code: 'attachment_not_found' },
      });
    } finally {
      if (deletion.isTransactionActive) await deletion.rollbackTransaction();
      await deletion.release();
    }
    const kept = await fixture.db.query<unknown[]>(
      `SELECT 1 FROM "api_messages" WHERE "conversation_id" = $1`,
      [conversationId],
    );
    expect(kept).toEqual([]);
  });

  it('keeps a published file when the write of its twin request fails afterwards', async () => {
    const owner = await fixture.user();
    const bytes = pdfWithText('jumeau en échec');
    const uploadId = randomUUID();
    const store = fixture.store;
    const put = store.put.bind(store);
    let arrived = 0;
    let open: () => void = () => undefined;
    const bothAdmitted = new Promise<void>((resolve) => {
      open = resolve;
    });
    const published = async (): Promise<boolean> =>
      (
        await fixture.db.query<unknown[]>(
          `SELECT 1 FROM "api_artifacts" WHERE "owner_user_id" = $1`,
          [owner.id],
        )
      ).length === 1;
    store.put = async (contentId, content, options) => {
      arrived += 1;
      const second = arrived === 2;
      if (second) open();
      await bothAdmitted;
      if (!second) return put(contentId, content, options);
      // The twin's write fails only once the first request has published their shared content.
      await expect.poll(published).toBe(true);
      throw new Error('provider down');
    };

    try {
      const results = await Promise.all([
        fixture.upload(owner.token, bytes, 'jumeau.pdf', { uploadId }),
        fixture.upload(owner.token, bytes, 'jumeau.pdf', { uploadId }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 503]);
    } finally {
      store.put = put;
      open();
    }

    // The failed twin released nothing: the content is referenced, and stays `ready`.
    const [content] = (await contentsOf(owner.id)).filter((row) => row.role === 'original');
    expect(content?.state).toBe('ready');
    await fixture.collectAbandoned();
    expect(await fixture.stored(String(content?.id))).toBe(true);
    const listed = await fixture.api('GET', '/files', owner.token);
    const fileId = (listed.body?.data?.items as { id: string }[])[0]?.id;
    const download = await fixture.raw(`/files/${String(fileId)}/content`, owner.token);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  });

  it('leaves no object without a record when a worker dies after writing a reduced image', async () => {
    const owner = await fixture.user();
    const picture = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#225588' },
    })
      .png()
      .toBuffer();

    // The reduced copy is written, then the worker dies before it can publish.
    const store = fixture.store;
    const put = store.put.bind(store);
    let crashed = false;
    store.put = async (contentId, bytes, options) => {
      const written = await put(contentId, bytes, options);
      if (options.mediaType === 'image/jpeg' && !crashed) {
        crashed = true;
        throw new Error('worker crashed after the write');
      }
      return written;
    };
    try {
      await fixture.upload(owner.token, picture, 'schema.png');
      await fixture.drainExtractions();
      await expect.poll(() => crashed).toBe(true);
    } finally {
      store.put = put;
    }

    // The bytes exist, and so does the row that lets the collector find them.
    const [orphan] = (await contentsOf(owner.id)).filter((row) => row.role === 'derivative');
    expect(orphan?.state).toBe('pending');
    expect(await fixture.stored(String(orphan?.id))).toBe(true);

    await fixture.db.query(
      `UPDATE "api_artifact_contents" SET "expires_at" = now() - interval '1 second' WHERE "id" = $1`,
      [orphan?.id],
    );
    // An expired reservation first stops being one; its row and bytes go after the grace period.
    await fixture.collect();
    expect(await fixture.stored(String(orphan?.id))).toBe(true);
    await fixture.collectAbandoned();

    expect(await fixture.stored(String(orphan?.id))).toBe(false);
    expect((await contentsOf(owner.id)).filter((row) => row.role === 'derivative')).toEqual([]);
  });
});

suite.sequential('file attachments with the capability off PostgreSQL', () => {
  const enabled = new FilesPostgresFixture();
  const disabled = new FilesPostgresFixture();

  beforeAll(async () => {
    await enabled.start(url!);
    await disabled.start(url!, { enabled: false });
  });
  afterAll(async () => {
    await disabled.close();
    await enabled.close();
  });

  it('refuses a known file identifier sent straight to the executions path', async () => {
    const owner = await enabled.user();
    const conversationId = await enabled.conversation(owner.token);
    const file = await enabled.uploaded(owner.token, pdfWithText('confidentiel'), 'secret.pdf');
    await enabled.extractAll();

    // The same database, the same user, the capability switched off.
    const attachments = disabled.app.get(MessageAttachmentsService);
    const executions = new ExecutionsService(
      disabled.db,
      disabled.app.get(TenantsService, { strict: false }),
      disabled.app.get(ConversationsService, { strict: false }),
      undefined,
      attachments,
    );
    const start = (attachmentIds: string[]) =>
      executions.start({ id: owner.id } as AuthPrincipal, conversationId, 'Résume', {
        submissionId: randomUUID(),
        profile: 'snapshot-v1',
        attachmentIds,
      });

    // A turn that carried the file while the capability was on.
    const enabledExecutions = new ExecutionsService(
      enabled.db,
      enabled.app.get(TenantsService, { strict: false }),
      enabled.app.get(ConversationsService, { strict: false }),
      undefined,
      enabled.app.get(MessageAttachmentsService),
    );
    const earlierConversation = await enabled.conversation(owner.token);
    const earlier = await enabledExecutions.start(
      { id: owner.id } as AuthPrincipal,
      earlierConversation,
      'Lis ce fichier',
      { submissionId: randomUUID(), profile: 'snapshot-v1', attachmentIds: [file.id] },
    );

    // The capability's own refusal, not "this file was not found".
    await expect(start([file.id])).rejects.toBeInstanceOf(NotFoundException);
    // Nothing of the refused turn was kept, and no file route answers either.
    const kept = await disabled.db.query<unknown[]>(
      `SELECT 1 FROM "api_messages" WHERE "conversation_id" = $1`,
      [conversationId],
    );
    expect(kept).toEqual([]);
    expect((await disabled.api('GET', '/files', owner.token)).status).toBe(404);

    // A turn without files is unaffected.
    const plain = await start([]);
    await expect(attachments.runtimeContent(plain.execution.id, 'Résume')).resolves.toBe('Résume');

    // The turn accepted earlier delivers its text only, lists no file, and records no delivery.
    await expect(attachments.runtimeContent(earlier.execution.id, 'Lis ce fichier')).resolves.toBe(
      'Lis ce fichier',
    );
    const [turn] = await disabled.db.query<{ id: string }[]>(
      `SELECT "id" FROM "api_messages" WHERE "execution_id" = $1 AND "role" = 'user'`,
      [earlier.execution.id],
    );
    expect(await attachments.forMessages([String(turn?.id)])).toEqual(new Map());
    const deliveries = await disabled.db.query<{ delivery: string | null }[]>(
      `SELECT "delivery" FROM "api_message_attachments" WHERE "message_id" = $1`,
      [turn?.id],
    );
    expect(deliveries).toEqual([{ delivery: null }]);
  });
});
