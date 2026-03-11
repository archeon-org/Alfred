import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProcessingStatus } from '@archeon-org/database';
import { CreditOperation } from '@archeon-org/types';
import { DocumentService } from 'src/document/document.service';

describe('DocumentService', () => {
  const documentRepo = {};
  const documentChunkRepo = {
    count: jest.fn(),
  };
  const userRepoQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const userRepo = {
    createQueryBuilder: jest.fn(() => userRepoQueryBuilder),
  };
  const documentRepository = {
    findById: jest.fn(),
    update: jest.fn(),
    findByIds: jest.fn(),
    updateMany: jest.fn(),
    softDelete: jest.fn(),
    create: jest.fn(),
  };
  const r2Service = {
    getSignedUrl: jest.fn(),
    deleteFile: jest.fn(),
    uploadFile: jest.fn(),
  };
  const userService = {
    findById: jest.fn(),
  };
  const queueService = {
    addDocumentProcessingJob: jest.fn(),
    addBulkDocumentProcessingJob: jest.fn(),
    addTitleGenerationJob: jest.fn(),
    addDocumentIndexingJob: jest.fn(),
    addDocumentIndexDeletionJob: jest.fn(),
  };
  const subscriptionService = {
    checkCredits: jest.fn(),
    consumeCredits: jest.fn(),
    consumeCreditsAmount: jest.fn(),
    addCredits: jest.fn(),
  };

  const service = new DocumentService(
    documentRepo as any,
    documentChunkRepo as any,
    userRepo as any,
    documentRepository as any,
    r2Service as any,
    userService as any,
    queueService as any,
    subscriptionService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    userRepoQueryBuilder.execute.mockResolvedValue({ affected: 1, raw: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns single AI upload result', async () => {
    jest.spyOn(service as any, 'uploadMany').mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      classificationSource: 'AI',
      documents: [{ id: 'doc-1' }],
      failures: [],
    });

    await expect(
      service.uploadAi('user-1', { originalname: 'a.pdf' } as any),
    ).resolves.toEqual({ id: 'doc-1' });
  });

  it('throws from uploadAi when upload result is empty', async () => {
    jest.spyOn(service as any, 'uploadMany').mockResolvedValue({
      total: 1,
      succeeded: 0,
      failed: 1,
      classificationSource: 'AI',
      documents: [],
      failures: [{ message: 'Failed to upload' }],
    });

    await expect(
      service.uploadAi('user-1', { originalname: 'a.pdf' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  const createFile = (name: string, size = 10) =>
    ({
      originalname: name,
      buffer: Buffer.from('content'),
      mimetype: 'application/pdf',
      size,
    }) as Express.Multer.File;

  it('throws when no files are provided for bulk upload', async () => {
    await expect(service.uploadManualBulk('user-1', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uploads manual document and skips AI queueing', async () => {
    const file = createFile('invoice-file.pdf', 25);

    jest.spyOn(service as any, 'reserveStorage').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'releaseStorage').mockResolvedValue(undefined);
    r2Service.uploadFile.mockResolvedValue(undefined);
    documentRepository.create.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      path: 'user-1/doc-1.pdf',
      originalName: 'invoice-file.pdf',
    });

    await expect(service.uploadManual('user-1', file)).resolves.toEqual(
      expect.objectContaining({ id: 'doc-1' }),
    );
    expect(queueService.addDocumentProcessingJob).not.toHaveBeenCalled();
    expect(documentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        classificationSource: 'MANUAL',
      }),
    );
  });

  it('queues bulk AI processing for multi-file upload', async () => {
    const files = [createFile('doc-a.pdf', 20), createFile('doc-b.pdf', 30)];

    jest.spyOn(service as any, 'reserveStorage').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'releaseStorage').mockResolvedValue(undefined);
    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: true,
      cost: 2,
      currentCredits: 100,
    });
    subscriptionService.consumeCreditsAmount.mockResolvedValue(96);
    r2Service.uploadFile.mockResolvedValue(undefined);
    documentRepository.create
      .mockResolvedValueOnce({
        id: 'doc-1',
        userId: 'user-1',
        path: 'user-1/doc-1.pdf',
        originalName: 'doc-a.pdf',
      })
      .mockResolvedValueOnce({
        id: 'doc-2',
        userId: 'user-1',
        path: 'user-1/doc-2.pdf',
        originalName: 'doc-b.pdf',
      });
    queueService.addBulkDocumentProcessingJob.mockResolvedValue(undefined);

    const result = await service.uploadAiBulk('user-1', files);

    expect(subscriptionService.consumeCreditsAmount).toHaveBeenCalledWith(
      'user-1',
      4,
      'AI upload (2 documents)',
    );
    expect(queueService.addBulkDocumentProcessingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        documents: expect.arrayContaining([
          expect.objectContaining({ documentId: 'doc-1' }),
          expect.objectContaining({ documentId: 'doc-2' }),
        ]),
      }),
    );
    expect(queueService.addDocumentProcessingJob).not.toHaveBeenCalled();
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('cleans up and refunds credits when bulk AI queueing fails', async () => {
    const files = [createFile('doc-a.pdf', 20), createFile('doc-b.pdf', 30)];
    const releaseStorageSpy = jest
      .spyOn(service as any, 'releaseStorage')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'reserveStorage').mockResolvedValue(undefined);

    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: true,
      cost: 1,
      currentCredits: 10,
    });
    subscriptionService.consumeCreditsAmount.mockResolvedValue(8);
    subscriptionService.addCredits.mockResolvedValue(10);
    r2Service.uploadFile.mockResolvedValue(undefined);
    r2Service.deleteFile.mockResolvedValue(undefined);
    documentRepository.softDelete.mockResolvedValue(undefined);
    documentRepository.create
      .mockResolvedValueOnce({
        id: 'doc-1',
        userId: 'user-1',
        path: 'user-1/doc-1.pdf',
        originalName: 'doc-a.pdf',
      })
      .mockResolvedValueOnce({
        id: 'doc-2',
        userId: 'user-1',
        path: 'user-1/doc-2.pdf',
        originalName: 'doc-b.pdf',
      });
    queueService.addBulkDocumentProcessingJob.mockRejectedValue(
      new Error('queue down'),
    );

    const result = await service.uploadAiBulk('user-1', files);

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(2);
    expect(documentRepository.softDelete).toHaveBeenCalledTimes(2);
    expect(subscriptionService.addCredits).toHaveBeenCalledWith(
      'user-1',
      2,
      'Refund for 2 failed AI uploads',
    );
    expect(releaseStorageSpy).toHaveBeenCalledWith('user-1', 50);
  });

  it('releases reserved storage when AI credits are insufficient', async () => {
    const file = createFile('doc-a.pdf', 12);

    jest.spyOn(service as any, 'reserveStorage').mockResolvedValue(undefined);
    const releaseStorageSpy = jest
      .spyOn(service as any, 'releaseStorage')
      .mockResolvedValue(undefined);
    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: true,
      cost: 5,
      currentCredits: 1,
    });

    await expect(service.uploadAi('user-1', file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(releaseStorageSpy).toHaveBeenCalledWith('user-1', 12);
  });

  it('normalizes upload errors from bad-request array message', () => {
    const message = (service as any).getUploadErrorMessage(
      new BadRequestException({ message: ['File type invalid'] }),
    );

    expect(message).toBe('File type invalid');
  });

  it('throws when requested document does not exist', async () => {
    documentRepository.findById.mockResolvedValue(null);

    await expect(
      service.getDocumentWithUrl('user-1', 'doc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when user tries to access another user document', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-2',
    });

    await expect(
      service.getDocumentWithUrl('user-1', 'doc-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns signed url and embedding flag for owned document', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      path: 'path/doc-1',
    });
    r2Service.getSignedUrl.mockResolvedValue('signed-url');
    documentChunkRepo.count.mockResolvedValue(2);

    await expect(
      service.getDocumentWithUrl('user-1', 'doc-1'),
    ).resolves.toEqual({
      document: {
        id: 'doc-1',
        userId: 'user-1',
        path: 'path/doc-1',
        hasEmbedding: true,
      },
      url: 'signed-url',
    });
  });

  it('updates pending document and marks it processed when category is set', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      processingStatus: ProcessingStatus.PENDING,
    });
    documentRepository.update.mockResolvedValue({ id: 'doc-1' });

    await service.update('user-1', 'doc-1', { categoryId: 'cat-1' } as any);

    expect(documentRepository.update).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({
        categoryId: 'cat-1',
        processingStatus: ProcessingStatus.COMPLETED,
        isProcessed: true,
      }),
    );
  });

  it('throws when bulk update has missing documents', async () => {
    documentRepository.findByIds.mockResolvedValue([
      { id: 'doc-1', userId: 'user-1' },
    ]);

    await expect(
      service.bulkUpdateCategory('user-1', ['doc-1', 'doc-2'], 'cat-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when bulk update includes other user document', async () => {
    documentRepository.findByIds.mockResolvedValue([
      { id: 'doc-1', userId: 'user-1' },
      { id: 'doc-2', userId: 'user-2' },
    ]);

    await expect(
      service.bulkUpdateCategory('user-1', ['doc-1', 'doc-2'], 'cat-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bulk updates category for user documents', async () => {
    documentRepository.findByIds.mockResolvedValue([
      { id: 'doc-1', userId: 'user-1' },
      { id: 'doc-2', userId: 'user-1' },
    ]);
    documentRepository.updateMany.mockResolvedValue(undefined);

    await service.bulkUpdateCategory('user-1', ['doc-1', 'doc-2'], 'cat-1');

    expect(documentRepository.updateMany).toHaveBeenCalledWith(
      ['doc-1', 'doc-2'],
      {
        categoryId: 'cat-1',
        processingStatus: ProcessingStatus.COMPLETED,
        isProcessed: true,
      },
    );
  });

  it('removes document and continues on cleanup errors', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      path: 'path/doc-1',
      size: 500,
    });
    r2Service.deleteFile.mockRejectedValue(new Error('r2 down'));
    queueService.addDocumentIndexDeletionJob.mockRejectedValue(
      new Error('queue down'),
    );
    documentRepository.softDelete.mockResolvedValue(undefined);
    jest.spyOn(service as any, 'releaseStorage').mockResolvedValue(undefined);

    await expect(service.remove('user-1', 'doc-1')).resolves.toBeUndefined();
    expect(documentRepository.softDelete).toHaveBeenCalledWith('doc-1');
  });

  it('rejects AI classification when credits are insufficient', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      path: 'path',
      originalName: 'a.pdf',
    });
    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: false,
      cost: 5,
      currentCredits: 1,
    });

    await expect(
      service.triggerAiClassification('user-1', 'doc-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('triggers AI classification and marks document pending', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      path: 'path',
      originalName: 'a.pdf',
    });
    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: true,
      cost: 1,
      currentCredits: 10,
    });
    subscriptionService.consumeCredits.mockResolvedValue(9);
    queueService.addDocumentProcessingJob.mockResolvedValue(undefined);
    documentRepository.update.mockResolvedValue({ id: 'doc-1' });

    await service.triggerAiClassification('user-1', 'doc-1');

    expect(subscriptionService.consumeCredits).toHaveBeenCalledWith(
      'user-1',
      CreditOperation.AI_CLASSIFICATION,
    );
    expect(queueService.addDocumentProcessingJob).toHaveBeenCalled();
    expect(documentRepository.update).toHaveBeenCalledWith('doc-1', {
      classificationSource: 'AI',
      processingStatus: ProcessingStatus.PENDING,
      categoryId: null,
    });
  });

  it('triggers AI title generation', async () => {
    const document = {
      id: 'doc-1',
      userId: 'user-1',
      path: 'path',
      originalName: 'a.pdf',
    };
    documentRepository.findById.mockResolvedValue(document);
    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: true,
      cost: 1,
      currentCredits: 10,
    });
    subscriptionService.consumeCredits.mockResolvedValue(9);
    queueService.addTitleGenerationJob.mockResolvedValue(undefined);

    await expect(
      service.triggerAiTitleGeneration('user-1', 'doc-1'),
    ).resolves.toEqual(document);
  });

  it('validates content before triggering indexing', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      content: null,
    });

    await expect(
      service.triggerDocumentIndexing('user-1', 'doc-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('triggers document indexing when content and credits are available', async () => {
    const document = {
      id: 'doc-1',
      userId: 'user-1',
      content: 'processed text',
    };
    documentRepository.findById.mockResolvedValue(document);
    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: true,
      cost: 2,
      currentCredits: 10,
    });
    subscriptionService.consumeCredits.mockResolvedValue(8);
    queueService.addDocumentIndexingJob.mockResolvedValue(undefined);

    await expect(
      service.triggerDocumentIndexing('user-1', 'doc-1'),
    ).resolves.toEqual(document);
    expect(subscriptionService.consumeCredits).toHaveBeenCalledWith(
      'user-1',
      CreditOperation.AI_EMBEDDING,
    );
    expect(queueService.addDocumentIndexingJob).toHaveBeenCalledWith({
      documentId: 'doc-1',
      userId: 'user-1',
      manualTrigger: true,
    });
  });

  it('throws not found when reserveStorage cannot find user', async () => {
    userRepoQueryBuilder.execute.mockResolvedValueOnce({
      affected: 0,
      raw: [],
    });
    userService.findById.mockResolvedValue(null);

    await expect(
      (service as any).reserveStorage('user-1', 100),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws storage limit exceeded when reserveStorage update fails for existing user', async () => {
    userRepoQueryBuilder.execute.mockResolvedValueOnce({
      affected: 0,
      raw: [],
    });
    userService.findById.mockResolvedValue({ id: 'user-1' });

    await expect(
      (service as any).reserveStorage('user-1', 100),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips storage updates when releaseStorage receives zero bytes', async () => {
    await (service as any).releaseStorage('user-1', 0);
    expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
