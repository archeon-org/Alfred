import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { FileExtractionWorker } from '@api/modules/files/application/file-extraction.worker';
import type { FileSettings } from '@api/modules/files/application/file-settings';
import type { ArtifactContentStore } from '@api/modules/files/domain/content-store.port';
import type { ExtractionResult, ExtractionRunner } from '@api/modules/files/domain/extraction.port';
import { FakeDb } from '../../../../support/fake-db';

const job = (overrides: Record<string, unknown> = {}) => ({
  content_id: 'content',
  kind: 'pdf',
  attempts: 1,
  tenant_id: 'tenant',
  owner_user_id: 'owner',
  backend: 'local',
  ...overrides,
});

function fixture(result: ExtractionResult | Error, claimed = [job()]) {
  const db = new FakeDb();
  const queue = [...claimed];
  db.when(/WITH candidate AS/u, () => {
    const next = queue.shift();
    return next === undefined ? [] : [next];
  })
    .when(/UPDATE "api_artifact_extractions" SET "state" = 'ready'/u, [{ content_id: 'content' }])
    .when(/UPDATE "api_artifact_extractions" SET "state" = 'failed'/u, [{ content_id: 'content' }])
    .when(/UPDATE "api_artifacts" a SET "readiness"/u, [{ id: 'artifact' }])
    .when(/FROM "api_artifact_contents" WHERE "id" = \$1 AND "state" = 'pending' FOR UPDATE/u, [
      { reserved: 1 },
    ]);
  const store = {
    get: vi.fn().mockResolvedValue(Buffer.from('%PDF-')),
    put: vi.fn().mockResolvedValue({ byteSize: 4, sha256: 'a'.repeat(64) }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const runner = {
    run: vi.fn<ExtractionRunner['run']>(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    ),
  };
  const worker = new FileExtractionWorker(
    db.asDataSource(),
    store as unknown as ArtifactContentStore,
    runner,
    {
      extractionTimeoutMs: 1_000,
      maxPdfPages: 5,
      maxExtractedChars: 100,
      imageMaxEdgePx: 64,
      imageMaxInputPixels: 1_000,
    } as FileSettings,
    { isEnabled: () => true } as unknown as FeatureFlagsService,
  );
  return { db, store, runner, worker };
}

describe('FileExtractionWorker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays idle while the capability is off or unknown', () => {
    vi.useFakeTimers();
    const db = new FakeDb();
    const worker = new FileExtractionWorker(
      db.asDataSource(),
      {} as ArtifactContentStore,
      {} as ExtractionRunner,
      {} as FileSettings,
    );

    worker.onModuleInit();
    vi.advanceTimersByTime(10_000);

    expect(db.query).not.toHaveBeenCalled();
  });

  it('publishes extracted text and marks the file ready', async () => {
    const { db, runner, worker } = fixture({
      status: 'text',
      text: 'contenu',
      pageCount: 3,
      truncated: false,
    });

    await worker.drain();

    const [request, deadline] = runner.run.mock.calls[0] as unknown as [
      { kind: string; limits: { maxPdfPages: number } },
      number,
    ];
    expect([request.kind, request.limits.maxPdfPages, deadline]).toEqual(['pdf', 5, 1_000]);
    expect(db.parametersOf(/SET "state" = 'ready', "text" = \$3/u)?.slice(2)).toEqual([
      'contenu',
      7,
      3,
      false,
    ]);
    expect(db.parametersOf(/UPDATE "api_artifacts" a SET "readiness"/u)).toEqual([
      'content',
      'ready',
      null,
      3,
    ]);
  });

  it('records the reduced copy before its bytes exist, then publishes it', async () => {
    const derivative = Buffer.from('jpeg');
    const { db, store, worker } = fixture(
      { status: 'image', derivative, mediaType: 'image/jpeg' },
      [job({ kind: 'image' })],
    );

    await worker.drain();

    // A crash between the two would otherwise leave an object nothing can ever find again.
    const reserved = db.statements.findIndex(({ sql }) =>
      /INSERT INTO "api_artifact_contents"[\s\S]*'pending'/u.test(sql),
    );
    expect(reserved).toBeGreaterThanOrEqual(0);
    expect(db.query.mock.invocationCallOrder[reserved]).toBeLessThan(
      store.put.mock.invocationCallOrder[0] as number,
    );
    expect(db.statements[reserved]?.parameters.slice(1, 6)).toEqual([
      'tenant',
      'owner',
      'local',
      'image/jpeg',
      4,
    ]);
    expect(store.put).toHaveBeenCalledWith(expect.any(String), derivative, {
      mediaType: 'image/jpeg',
    });
    expect(db.ran(/"derivative_content_id" = \$3/u)).toBe(true);
    expect(db.parametersOf(/SET "state" = \$2, "expires_at" = NULL/u)?.[1]).toBe('ready');
  });

  it('gives an unowned reduced copy to the collector when the lease was lost or the file deleted', async () => {
    const lost = fixture(
      { status: 'image', derivative: Buffer.from('jpeg'), mediaType: 'image/jpeg' },
      [job({ kind: 'image' })],
    );
    lost.db.when(/"derivative_content_id" = \$3/u, []);
    await lost.worker.drain();
    expect(lost.db.parametersOf(/SET "state" = \$2, "expires_at" = NULL/u)?.[1]).toBe('purging');
    expect(lost.db.ran(/UPDATE "api_artifacts" a SET "readiness"/u)).toBe(false);

    const deleted = fixture(
      { status: 'image', derivative: Buffer.from('jpeg'), mediaType: 'image/jpeg' },
      [job({ kind: 'image' })],
    );
    deleted.db.when(/UPDATE "api_artifacts" a SET "readiness"/u, []);
    await deleted.worker.drain();
    expect(deleted.db.parametersOf(/SET "state" = \$2, "expires_at" = NULL/u)?.[1]).toBe('purging');
  });

  it('leaves a reservation the collector can find when the bytes cannot be written', async () => {
    const { db, store, worker } = fixture(
      { status: 'image', derivative: Buffer.from('jpeg'), mediaType: 'image/jpeg' },
      [job({ kind: 'image' })],
    );
    store.put.mockRejectedValue(new Error('provider down'));

    await worker.drain();

    expect(db.ran(/INSERT INTO "api_artifact_contents"[\s\S]*'pending'/u)).toBe(true);
    expect(db.ran(/"derivative_content_id" = \$3/u)).toBe(false);
    // A store failure is an attempt like any other: queued again, and bounded by the attempts.
    expect(db.ran(/SET "state" = 'queued'/u)).toBe(true);
  });

  it('gives up on a store that never takes the reduced copy, instead of retrying for ever', async () => {
    const { db, store, worker } = fixture(
      { status: 'image', derivative: Buffer.from('jpeg'), mediaType: 'image/jpeg' },
      [job({ kind: 'image', attempts: 3 })],
    );
    store.put.mockRejectedValue(new Error('provider down'));

    await worker.drain();

    expect(db.parametersOf(/SET "state" = 'failed', "failure_code" = \$3/u)?.[2]).toBe(
      'parser_error',
    );
  });

  it('leaves a durable record of a reduced copy that lost its reservation while it was written', async () => {
    const { db, store, worker } = fixture(
      { status: 'image', derivative: Buffer.from('jpeg'), mediaType: 'image/jpeg' },
      [job({ kind: 'image' })],
    );
    db.when(
      /FROM "api_artifact_contents" WHERE "id" = \$1 AND "state" = 'pending' FOR UPDATE/u,
      [],
    );

    await worker.drain();

    // Nothing is deleted here, where a failure would lose the bytes for good: a `purging` row
    // is what the collector retries from.
    const written = store.put.mock.calls[0]?.[0] as string;
    const tombstone = db.statements.find(({ sql }) =>
      /INSERT INTO "api_artifact_contents"[\s\S]*'purging'\)/u.test(sql),
    );
    expect(tombstone?.parameters.slice(0, 4)).toEqual([written, 'tenant', 'owner', 'derivative']);
    expect(store.delete).not.toHaveBeenCalled();
    expect(db.ran(/"derivative_content_id" = \$3/u)).toBe(false);
    expect(db.ran(/SET "state" = 'queued'/u)).toBe(true);
  });

  it('records an unreadable document as failed, with the reason', async () => {
    const { db, worker } = fixture({ status: 'failed', failureCode: 'no_readable_text' });

    await worker.drain();

    expect(db.parametersOf(/SET "state" = 'failed', "failure_code" = \$3/u)?.[2]).toBe(
      'no_readable_text',
    );
    expect(db.parametersOf(/UPDATE "api_artifacts" a SET "readiness"/u)?.slice(1, 3)).toEqual([
      'failed',
      'no_readable_text',
    ]);
  });

  it('retries when the runner itself fails, and gives up after the last attempt', async () => {
    const retried = fixture(new Error('worker crashed'));
    await retried.worker.drain();
    expect(retried.db.ran(/SET "state" = 'queued'/u)).toBe(true);
    expect(retried.db.ran(/SET "state" = 'failed'/u)).toBe(false);

    const exhausted = fixture(new Error('worker crashed'), [job({ attempts: 3 })]);
    await exhausted.worker.drain();
    expect(exhausted.db.ran(/SET "state" = 'failed'/u)).toBe(true);
  });

  it('ends a job whose file was deleted, but retries bytes it merely cannot see', async () => {
    const deleted = fixture({ status: 'failed', failureCode: 'timeout' });
    deleted.store.get.mockResolvedValue(null);
    deleted.db.when(/SELECT "state" FROM "api_artifact_contents"/u, [{ state: 'purging' }]);
    await deleted.worker.drain();
    expect(deleted.runner.run).not.toHaveBeenCalled();
    expect(deleted.db.ran(/SET "state" = 'failed'/u)).toBe(true);

    const unseen = fixture({ status: 'failed', failureCode: 'timeout' });
    unseen.store.get.mockResolvedValue(null);
    unseen.db.when(/SELECT "state" FROM "api_artifact_contents"/u, [{ state: 'ready' }]);
    await unseen.worker.drain();
    expect(unseen.db.ran(/SET "state" = 'queued'/u)).toBe(true);
  });

  it('never publishes after losing its lease', async () => {
    const { db, worker } = fixture({ status: 'text', text: 'x', pageCount: 1, truncated: false });
    db.when(/UPDATE "api_artifact_extractions" SET "state" = 'ready'/u, []);

    await worker.drain();

    expect(db.ran(/UPDATE "api_artifacts" a SET "readiness"/u)).toBe(false);
  });

  it('polls when enabled, and stops at shutdown', async () => {
    vi.useFakeTimers();
    const { db, worker } = fixture({ status: 'failed', failureCode: 'timeout' }, []);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(2_100);
    const scans = db.query.mock.calls.length;
    expect(scans).toBeGreaterThanOrEqual(2);

    await worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(db.query.mock.calls.length).toBe(scans);
  });
});
