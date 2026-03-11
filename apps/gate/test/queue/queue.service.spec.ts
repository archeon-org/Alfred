import { QueueService } from 'src/queue/queue.service';

describe('QueueService', () => {
  const applyAsync = jest.fn();
  const createTask = jest.fn(() => ({ applyAsync }));
  const celeryClient = { createTask };
  const service = new QueueService(celeryClient as any);

  beforeEach(() => {
    jest.clearAllMocks();
    applyAsync.mockResolvedValue(undefined);
  });

  it.each([
    [
      'addDocumentProcessingJob',
      'scribe.tasks.document.process_document',
      { documentId: 'doc-1', userId: 'user-1' },
    ],
    [
      'addBulkDocumentProcessingJob',
      'scribe.tasks.document.process_documents_bulk',
      { userId: 'user-1', documents: [{ documentId: 'doc-1' }] },
    ],
    [
      'addTitleGenerationJob',
      'scribe.tasks.document.generate_title',
      { documentId: 'doc-1', userId: 'user-1' },
    ],
    [
      'addDocumentIndexingJob',
      'scribe.tasks.rag.index_document',
      { documentId: 'doc-1', userId: 'user-1' },
    ],
    [
      'addDocumentIndexDeletionJob',
      'scribe.tasks.rag.delete_document_index',
      { documentId: 'doc-1', userId: 'user-1' },
    ],
    [
      'addBackfillDocumentsJob',
      'scribe.tasks.rag.backfill_documents',
      { requestedBy: 'admin', batchSize: 100 },
    ],
  ] as const)(
    'creates %s task and enqueues payload',
    async (methodName, taskName, payload) => {
      await (service as any)[methodName](payload);

      expect(createTask).toHaveBeenCalledWith(taskName);
      expect(applyAsync).toHaveBeenCalledWith([payload]);
    },
  );

  it('rethrows celery errors', async () => {
    applyAsync.mockRejectedValue(new Error('queue unavailable'));

    await expect(
      service.addDocumentProcessingJob({
        documentId: 'doc-1',
        userId: 'user-1',
      } as any),
    ).rejects.toThrow('queue unavailable');
  });

  it.each([
    ['addBulkDocumentProcessingJob', { userId: 'user-1', documents: [] }],
    ['addTitleGenerationJob', { documentId: 'doc-1', userId: 'user-1' }],
    ['addDocumentIndexingJob', { documentId: 'doc-1', userId: 'user-1' }],
    ['addDocumentIndexDeletionJob', { documentId: 'doc-1', userId: 'user-1' }],
    ['addBackfillDocumentsJob', { requestedBy: 'admin', batchSize: 10 }],
  ] as const)('rethrows celery errors for %s', async (methodName, payload) => {
    applyAsync.mockRejectedValueOnce(new Error(`${methodName} failed`));

    await expect((service as any)[methodName](payload)).rejects.toThrow(
      `${methodName} failed`,
    );
  });
});
