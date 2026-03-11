import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DocumentRepository } from './document.repository';
import {
  DocumentChunkEntity,
  DocumentEntity,
  UserEntity,
} from '@archeon-org/database';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { R2Service } from '@archeon-org/module';
import { UpdateDocumentDto } from './dto/document.dto';
import {
  paginate,
  PaginateQuery,
  Paginated,
  FilterOperator,
} from 'nestjs-paginate';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserService } from '../user/user.service';
import { QueueService } from '../queue/queue.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { CreditOperation } from '@archeon-org/types';
import { ProcessingStatus } from '@archeon-org/database';

type ClassificationSource = 'AI' | 'MANUAL';

interface UploadManyOptions {
  useBulkWorkerTask?: boolean;
}

interface BulkUploadFailure {
  originalName: string;
  message: string;
  code: 'UPLOAD_FAILED' | 'QUEUE_FAILED';
}

export interface DocumentBulkUploadResult {
  total: number;
  succeeded: number;
  failed: number;
  classificationSource: ClassificationSource;
  documents: DocumentEntity[];
  failures: BulkUploadFailure[];
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  private readonly bulkUploadConcurrency = 4;

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(DocumentChunkEntity)
    private readonly documentChunkRepo: Repository<DocumentChunkEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly documentRepository: DocumentRepository,
    private readonly r2Service: R2Service,
    private readonly userService: UserService,
    private readonly queueService: QueueService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async uploadAi(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentEntity> {
    const result = await this.uploadMany(userId, [file], 'AI', {
      useBulkWorkerTask: false,
    });
    if (result.documents.length === 0) {
      throw new BadRequestException(
        result.failures[0]?.message || 'Failed to upload file',
      );
    }
    return result.documents[0];
  }

  async uploadManual(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentEntity> {
    const result = await this.uploadMany(userId, [file], 'MANUAL');
    if (result.documents.length === 0) {
      throw new BadRequestException(
        result.failures[0]?.message || 'Failed to upload file',
      );
    }
    return result.documents[0];
  }

  async uploadAiBulk(
    userId: string,
    files: Express.Multer.File[],
  ): Promise<DocumentBulkUploadResult> {
    return this.uploadMany(userId, files, 'AI', {
      useBulkWorkerTask: true,
    });
  }

  async uploadManualBulk(
    userId: string,
    files: Express.Multer.File[],
  ): Promise<DocumentBulkUploadResult> {
    return this.uploadMany(userId, files, 'MANUAL');
  }

  private async uploadMany(
    userId: string,
    files: Express.Multer.File[],
    classificationSource: ClassificationSource,
    options?: UploadManyOptions,
  ): Promise<DocumentBulkUploadResult> {
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }

    const preparedFiles = files.filter(Boolean);
    if (preparedFiles.length === 0) {
      throw new BadRequestException('At least one valid file is required');
    }

    const totalSizeBytes = preparedFiles.reduce(
      (total, file) => total + Math.max(0, Number(file.size) || 0),
      0,
    );

    await this.reserveStorage(userId, totalSizeBytes);

    let reservedCredits = 0;
    let perFileCreditCost = 0;

    try {
      if (classificationSource === 'AI') {
        const creditCheck = await this.subscriptionService.checkCredits(
          userId,
          CreditOperation.AI_CLASSIFICATION,
        );

        perFileCreditCost = creditCheck.cost;
        reservedCredits = preparedFiles.length * perFileCreditCost;

        if (creditCheck.currentCredits < reservedCredits) {
          throw new BadRequestException(
            `Insufficient credits for AI processing. Required: ${reservedCredits}, Available: ${creditCheck.currentCredits}.`,
          );
        }

        await this.subscriptionService.consumeCreditsAmount(
          userId,
          reservedCredits,
          `AI upload (${preparedFiles.length} document${preparedFiles.length === 1 ? '' : 's'})`,
        );
      }
    } catch (error) {
      await this.releaseStorage(userId, totalSizeBytes);
      throw error;
    }

    const queue = [...preparedFiles];
    const documents: DocumentEntity[] = [];
    const failures: BulkUploadFailure[] = [];
    let usedStorageBytes = 0;
    const useBulkWorkerTask =
      classificationSource === 'AI' &&
      !!options?.useBulkWorkerTask &&
      preparedFiles.length > 1;

    const worker = async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) {
          return;
        }

        let document: DocumentEntity;
        try {
          document = await this.handleFileUploadWithoutAccounting(
            userId,
            file,
            classificationSource,
          );
        } catch (error) {
          failures.push({
            originalName: file.originalname || 'document',
            message: this.getUploadErrorMessage(error),
            code: 'UPLOAD_FAILED',
          });
          continue;
        }

        if (classificationSource === 'AI' && !useBulkWorkerTask) {
          try {
            await this.queueService.addDocumentProcessingJob({
              documentId: document.id,
              userId: document.userId,
              key: document.path,
              originalName: document.originalName,
            });
            this.logger.log(
              `Document queued for AI processing: ${document.id}`,
            );
          } catch (error) {
            await this.cleanupFailedDocumentUpload(document);
            this.logger.error(
              `Failed to queue AI processing for document ${document.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
            failures.push({
              originalName:
                file.originalname || document.originalName || 'document',
              message: 'Failed to queue AI processing job',
              code: 'QUEUE_FAILED',
            });
            continue;
          }
        } else if (classificationSource === 'MANUAL') {
          this.logger.log(
            `Document uploaded manually, skipping AI processing: ${document.id}`,
          );
        }

        documents.push(document);
        usedStorageBytes += Math.max(0, Number(file.size) || 0);
      }
    };

    await Promise.all(
      Array.from(
        {
          length: Math.min(this.bulkUploadConcurrency, preparedFiles.length),
        },
        () => worker(),
      ),
    );

    if (
      classificationSource === 'AI' &&
      useBulkWorkerTask &&
      documents.length > 0
    ) {
      try {
        await this.queueService.addBulkDocumentProcessingJob({
          userId,
          documents: documents.map((document) => ({
            documentId: document.id,
            userId: document.userId,
            key: document.path,
            originalName: document.originalName,
          })),
          notifySummary: true,
          suppressPerDocumentNotifications: true,
        });
        this.logger.log(
          `Queued bulk AI processing for user ${userId} (${documents.length} documents)`,
        );
      } catch (error) {
        const queuedDocuments = [...documents];
        documents.length = 0;
        usedStorageBytes = 0;

        for (const document of queuedDocuments) {
          await this.cleanupFailedDocumentUpload(document);
          failures.push({
            originalName: document.originalName || 'document',
            message: 'Failed to queue bulk AI processing job',
            code: 'QUEUE_FAILED',
          });
        }

        this.logger.error(
          `Failed to queue bulk AI processing for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const unusedStorageBytes = Math.max(0, totalSizeBytes - usedStorageBytes);
    if (unusedStorageBytes > 0) {
      try {
        await this.releaseStorage(userId, unusedStorageBytes);
      } catch (error) {
        this.logger.error(
          `Failed to release unused storage for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (
      classificationSource === 'AI' &&
      failures.length > 0 &&
      perFileCreditCost > 0
    ) {
      const refundAmount = failures.length * perFileCreditCost;
      if (refundAmount > 0 && reservedCredits > 0) {
        try {
          await this.subscriptionService.addCredits(
            userId,
            refundAmount,
            `Refund for ${failures.length} failed AI upload${failures.length === 1 ? '' : 's'}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to refund credits for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return {
      total: preparedFiles.length,
      succeeded: documents.length,
      failed: failures.length,
      classificationSource,
      documents,
      failures,
    };
  }

  private async handleFileUploadWithoutAccounting(
    userId: string,
    file: Express.Multer.File,
    classificationSource: ClassificationSource,
  ): Promise<DocumentEntity> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileExtension = path.extname(file.originalname);
    const key = `${userId}/${uuidv4()}${fileExtension}`;

    const decodedFilename = decodeURIComponent(file.originalname);
    const cleanTitle = path
      .basename(decodedFilename, path.extname(decodedFilename))
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    this.logger.log(
      `Uploading document for user ${userId}: ${decodedFilename}`,
    );

    try {
      await this.r2Service.uploadFile(key, file.buffer, file.mimetype);

      const document = await this.documentRepository.create({
        userId,
        filename: key,
        originalName: decodedFilename,
        mimetype: file.mimetype,
        size: file.size,
        path: key,
        title: cleanTitle || decodedFilename,
        classificationSource,
      });

      this.logger.log(`Document uploaded successfully: ${document.id}`);
      return document;
    } catch (error) {
      this.logger.error(
        `Failed to upload file to R2: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to upload file');
    }
  }

  private async reserveStorage(userId: string, bytes: number): Promise<void> {
    const normalizedBytes = Math.max(0, Math.floor(bytes));
    if (normalizedBytes === 0) {
      return;
    }

    const result = await this.userRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        storageUsed: () => `"storageUsed" + ${normalizedBytes}`,
      })
      .where('id = :userId', { userId })
      .andWhere(`"storageUsed" + :bytes <= "storageLimit"`, {
        bytes: normalizedBytes,
      })
      .execute();

    if (result.affected === 0) {
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      throw new BadRequestException(
        'Storage limit exceeded. Please upgrade your plan to upload more documents.',
      );
    }
  }

  private async releaseStorage(userId: string, bytes: number): Promise<void> {
    const normalizedBytes = Math.max(0, Math.floor(bytes));
    if (normalizedBytes === 0) {
      return;
    }

    await this.userRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        storageUsed: () => `GREATEST(0, "storageUsed" - ${normalizedBytes})`,
      })
      .where('id = :userId', { userId })
      .execute();
  }

  private async cleanupFailedDocumentUpload(
    document: DocumentEntity,
  ): Promise<void> {
    try {
      await this.r2Service.deleteFile(document.path);
    } catch (error) {
      this.logger.error(
        `Failed cleanup R2 delete for document ${document.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await this.documentRepository.softDelete(document.id);
    } catch (error) {
      this.logger.error(
        `Failed cleanup DB delete for document ${document.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getUploadErrorMessage(error: unknown): string {
    if (!error) {
      return 'Failed to upload file';
    }

    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }

      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        Array.isArray((response as { message?: unknown }).message)
      ) {
        const firstMessage = (response as { message: string[] }).message[0];
        if (firstMessage) {
          return firstMessage;
        }
      }

      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof (response as { message?: unknown }).message === 'string'
      ) {
        return (response as { message: string }).message;
      }

      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Failed to upload file';
  }

  async getUserDocuments(
    userId: string,
    query: PaginateQuery,
  ): Promise<Paginated<DocumentEntity>> {
    this.logger.debug(`Fetching documents for user: ${userId}`);
    return paginate<DocumentEntity>(query, this.documentRepo as any, {
      sortableColumns: ['id', 'title', 'createdAt'],
      nullSort: 'last',
      defaultSortBy: [['createdAt', 'DESC']],
      searchableColumns: ['title', 'originalName'],
      filterableColumns: {
        categoryId: [FilterOperator.EQ, FilterOperator.NULL],
        processingStatus: [FilterOperator.EQ, FilterOperator.IN],
        classificationSource: [FilterOperator.EQ],
        'tags.id': [FilterOperator.EQ],
      },
      where: { userId },
    });
  }

  async getDocumentWithUrl(
    userId: string,
    documentId: string,
  ): Promise<{
    document: DocumentEntity & { hasEmbedding: boolean };
    url: string;
  }> {
    this.logger.debug(
      `Fetching document with URL: ${documentId} for user ${userId}`,
    );
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      this.logger.warn(`Document not found: ${documentId}`);
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      this.logger.warn(
        `Access denied for user ${userId} to document ${documentId}`,
      );
      throw new ForbiddenException('Access denied');
    }

    const url = await this.r2Service.getSignedUrl(document.path);
    const hasEmbedding =
      (await this.documentChunkRepo.count({
        where: { documentId },
      })) > 0;
    return {
      document: { ...document, hasEmbedding },
      url,
    };
  }

  async update(
    userId: string,
    documentId: string,
    updateDocumentDto: UpdateDocumentDto,
  ): Promise<DocumentEntity> {
    this.logger.log(`Updating document ${documentId} for user ${userId}`);
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      this.logger.warn(`Document not found: ${documentId}`);
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      this.logger.warn(
        `Access denied for user ${userId} to document ${documentId}`,
      );
      throw new ForbiddenException('Access denied');
    }

    if (
      updateDocumentDto.categoryId &&
      (document.processingStatus === ProcessingStatus.PENDING ||
        document.processingStatus === ProcessingStatus.FAILED)
    ) {
      updateDocumentDto.processingStatus = ProcessingStatus.COMPLETED;
      updateDocumentDto.isProcessed = true;
    }

    return this.documentRepository.update(documentId, updateDocumentDto);
  }

  async bulkUpdateCategory(
    userId: string,
    documentIds: string[],
    categoryId: string,
  ): Promise<void> {
    this.logger.log(
      `Bulk updating documents ${documentIds.join(', ')} to category ${categoryId} for user ${userId}`,
    );

    const documents = await this.documentRepository.findByIds(documentIds);
    if (documents.length !== documentIds.length) {
      throw new NotFoundException('One or more documents not found');
    }

    for (const doc of documents) {
      if (doc.userId !== userId) {
        throw new ForbiddenException(`Access denied for document ${doc.id}`);
      }
    }

    await this.documentRepository.updateMany(documentIds, {
      categoryId,
      processingStatus: ProcessingStatus.COMPLETED,
      isProcessed: true,
    });
  }

  async remove(userId: string, documentId: string): Promise<void> {
    this.logger.log(`Removing document ${documentId} for user ${userId}`);
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      this.logger.warn(`Document not found: ${documentId}`);
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      this.logger.warn(
        `Access denied for user ${userId} to document ${documentId}`,
      );
      throw new ForbiddenException('Access denied');
    }

    try {
      await this.r2Service.deleteFile(document.path);
    } catch (error) {
      this.logger.error(
        `Failed to delete file from R2: ${error.message}`,
        error.stack,
      );
    }

    try {
      await this.queueService.addDocumentIndexDeletionJob({
        documentId,
        userId,
      });
      this.logger.log(`Queued chunk index deletion for document ${documentId}`);
    } catch (error) {
      this.logger.error(
        `Failed to queue index deletion for document ${documentId}: ${error.message}`,
        error.stack,
      );
    }

    await this.releaseStorage(userId, document.size);

    await this.documentRepository.softDelete(documentId);
  }

  async triggerAiClassification(
    userId: string,
    documentId: string,
  ): Promise<DocumentEntity> {
    this.logger.log(
      `Triggering AI classification for document ${documentId} for user ${userId}`,
    );
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const creditCheck = await this.subscriptionService.checkCredits(
      userId,
      CreditOperation.AI_CLASSIFICATION,
    );

    if (!creditCheck.canAfford) {
      throw new BadRequestException(
        `Insufficient credits for AI classification. Required: ${creditCheck.cost}, Available: ${creditCheck.currentCredits}.`,
      );
    }

    await this.subscriptionService.consumeCredits(
      userId,
      CreditOperation.AI_CLASSIFICATION,
    );

    await this.queueService.addDocumentProcessingJob({
      documentId: document.id,
      userId: document.userId,
      key: document.path,
      originalName: document.originalName,
    });

    return this.documentRepository.update(documentId, {
      classificationSource: 'AI',
      processingStatus: ProcessingStatus.PENDING,
      categoryId: null,
    });
  }

  async triggerAiTitleGeneration(
    userId: string,
    documentId: string,
  ): Promise<DocumentEntity> {
    this.logger.log(
      `Triggering AI title generation for document ${documentId} for user ${userId}`,
    );
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const creditCheck = await this.subscriptionService.checkCredits(
      userId,
      CreditOperation.AI_TITLE_GENERATION,
    );

    if (!creditCheck.canAfford) {
      throw new BadRequestException(
        `Insufficient credits for AI title generation. Required: ${creditCheck.cost}, Available: ${creditCheck.currentCredits}.`,
      );
    }

    await this.subscriptionService.consumeCredits(
      userId,
      CreditOperation.AI_TITLE_GENERATION,
    );

    await this.queueService.addTitleGenerationJob({
      documentId: document.id,
      userId: document.userId,
      key: document.path,
      originalName: document.originalName,
    });

    return document;
  }

  async triggerDocumentIndexing(
    userId: string,
    documentId: string,
  ): Promise<DocumentEntity> {
    this.logger.log(
      `Triggering document indexing for document ${documentId} for user ${userId}`,
    );
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (!document.content) {
      throw new BadRequestException(
        'Document must be processed before indexing',
      );
    }

    const creditCheck = await this.subscriptionService.checkCredits(
      userId,
      CreditOperation.AI_EMBEDDING,
    );

    if (!creditCheck.canAfford) {
      throw new BadRequestException(
        `Insufficient credits. Required: ${creditCheck.cost}, Available: ${creditCheck.currentCredits}.`,
      );
    }

    await this.subscriptionService.consumeCredits(
      userId,
      CreditOperation.AI_EMBEDDING,
    );

    await this.queueService.addDocumentIndexingJob({
      documentId: document.id,
      userId: document.userId,
      manualTrigger: true,
    });

    return document;
  }
}
