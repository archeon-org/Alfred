import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentController } from 'src/document/document.controller';

describe('DocumentController', () => {
  const documentService = {
    uploadAi: jest.fn(),
    uploadManual: jest.fn(),
    uploadAiBulk: jest.fn(),
    uploadManualBulk: jest.fn(),
    getUserDocuments: jest.fn(),
    getDocumentWithUrl: jest.fn(),
    bulkUpdateCategory: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    triggerAiClassification: jest.fn(),
    triggerAiTitleGeneration: jest.fn(),
    triggerDocumentIndexing: jest.fn(),
  };
  const controller = new DocumentController(documentService as any);
  const req = { user: { id: 'user-1' } };
  const validFile = {
    originalname: 'invoice.pdf',
    mimetype: 'application/pdf',
    size: 1024,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads AI document', async () => {
    await controller.uploadAi(req as any, validFile as any);

    expect(documentService.uploadAi).toHaveBeenCalledWith('user-1', validFile);
  });

  it('uploads manual document', async () => {
    await controller.uploadManual(req as any, validFile as any);

    expect(documentService.uploadManual).toHaveBeenCalledWith(
      'user-1',
      validFile,
    );
  });

  it('validates bulk AI upload requires files', async () => {
    await expect(
      controller.uploadAiBulk(req as any, undefined as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('validates bulk AI upload max file count', async () => {
    const files = Array.from({ length: 51 }, () => validFile);

    await expect(
      controller.uploadAiBulk(req as any, files as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('validates bulk AI upload file type', async () => {
    const files = [
      { originalname: 'file.txt', mimetype: 'text/plain', size: 100 },
    ];

    await expect(
      controller.uploadAiBulk(req as any, files as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('validates bulk AI upload file size', async () => {
    const files = [
      {
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 21 * 1024 * 1024,
      },
    ];

    await expect(
      controller.uploadAiBulk(req as any, files as any),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('uploads valid AI bulk files', async () => {
    await controller.uploadAiBulk(req as any, [validFile] as any);

    expect(documentService.uploadAiBulk).toHaveBeenCalledWith('user-1', [
      validFile,
    ]);
  });

  it('uploads valid manual bulk files', async () => {
    await controller.uploadManualBulk(req as any, [validFile] as any);

    expect(documentService.uploadManualBulk).toHaveBeenCalledWith('user-1', [
      validFile,
    ]);
  });

  it('returns user documents', async () => {
    const query = { page: 1 };
    await controller.getDocuments(req as any, query as any);

    expect(documentService.getUserDocuments).toHaveBeenCalledWith(
      'user-1',
      query,
    );
  });

  it('returns single document', async () => {
    await controller.getDocument(req as any, 'doc-1');

    expect(documentService.getDocumentWithUrl).toHaveBeenCalledWith(
      'user-1',
      'doc-1',
    );
  });

  it('bulk updates document category', async () => {
    await controller.bulkUpdateDocuments(
      req as any,
      {
        documentIds: ['doc-1'],
        categoryId: 'cat-1',
      } as any,
    );

    expect(documentService.bulkUpdateCategory).toHaveBeenCalledWith(
      'user-1',
      ['doc-1'],
      'cat-1',
    );
  });

  it('updates a single document', async () => {
    const dto = { title: 'Updated' };
    await controller.updateDocument(req as any, 'doc-1', dto as any);

    expect(documentService.update).toHaveBeenCalledWith('user-1', 'doc-1', dto);
  });

  it('deletes a document', async () => {
    await controller.deleteDocument(req as any, 'doc-1');

    expect(documentService.remove).toHaveBeenCalledWith('user-1', 'doc-1');
  });

  it('triggers classification, title generation, and indexing', async () => {
    await controller.triggerAiClassification(req as any, 'doc-1');
    await controller.triggerAiTitleGeneration(req as any, 'doc-1');
    await controller.triggerDocumentIndexing(req as any, 'doc-1');

    expect(documentService.triggerAiClassification).toHaveBeenCalledWith(
      'user-1',
      'doc-1',
    );
    expect(documentService.triggerAiTitleGeneration).toHaveBeenCalledWith(
      'user-1',
      'doc-1',
    );
    expect(documentService.triggerDocumentIndexing).toHaveBeenCalledWith(
      'user-1',
      'doc-1',
    );
  });
});
