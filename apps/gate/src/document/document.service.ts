import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DocumentRepository } from './document.repository';
import { DocumentEntity } from '@archeon-org/database';
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

import { ProcessingStatus } from '@archeon-org/database';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    private readonly documentRepository: DocumentRepository,
    private readonly r2Service: R2Service,
    private readonly userService: UserService,
    private readonly queueService: QueueService,
  ) {}

  async uploadAi(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentEntity> {
    const document = await this.handleFileUpload(userId, file, 'AI');

    // Add job to queue for processing
    await this.queueService.addDocumentProcessingJob({
      documentId: document.id,
      userId: document.userId,
      key: document.path,
      originalName: document.originalName,
    });
    this.logger.log(`Document queued for AI processing: ${document.id}`);

    return document;
  }

  async uploadManual(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentEntity> {
    const document = await this.handleFileUpload(userId, file, 'MANUAL');
    this.logger.log(
      `Document uploaded manually, skipping AI processing: ${document.id}`,
    );
    return document;
  }

  private async handleFileUpload(
    userId: string,
    file: Express.Multer.File,
    classificationSource: 'AI' | 'MANUAL',
  ): Promise<DocumentEntity> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Check storage limit
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentStorage = Number(user.storageUsed) || 0;
    const storageLimit = Number(user.storageLimit) || 0;
    const newStorageUsed = currentStorage + file.size;

    if (newStorageUsed > storageLimit) {
      throw new BadRequestException(
        'Storage limit exceeded. Please upgrade your plan to upload more documents.',
      );
    }

    const fileExtension = path.extname(file.originalname);
    const key = `${userId}/${uuidv4()}${fileExtension}`;

    // Decode URL-encoded filename and clean up for use as initial title
    const decodedFilename = decodeURIComponent(file.originalname);
    const cleanTitle = path
      .basename(decodedFilename, path.extname(decodedFilename))
      .replace(/[_-]+/g, ' ') // Replace underscores and hyphens with spaces
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();

    this.logger.log(
      `Uploading document for user ${userId}: ${decodedFilename}`,
    );

    try {
      await this.r2Service.uploadFile(key, file.buffer, file.mimetype);

      const document = await this.documentRepository.create({
        userId,
        filename: key,
        originalName: decodedFilename, // Store decoded filename
        mimetype: file.mimetype,
        size: file.size,
        path: key,
        title: cleanTitle || decodedFilename, // Use cleaned title, fallback to original
        classificationSource,
      });

      // Update user storage usage
      await this.userService.update(userId, {
        storageUsed: newStorageUsed,
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
  ): Promise<{ document: DocumentEntity; url: string }> {
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
    return { document, url };
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

    // If category is updated, update processing status to COMPLETED if it was PENDING or FAILED
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

    // Verify ownership of all documents
    const documents = await this.documentRepository.findByIds(documentIds);
    if (documents.length !== documentIds.length) {
      throw new NotFoundException('One or more documents not found');
    }

    for (const doc of documents) {
      if (doc.userId !== userId) {
        throw new ForbiddenException(`Access denied for document ${doc.id}`);
      }
    }

    // Update all documents
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
      // We continue with the deletion process even if R2 deletion fails
      // to avoid blocking the user action, but we log the error.
    }

    // Delete the document's embedding asynchronously
    await this.queueService.addDeleteEmbeddingJob({ documentId });

    // Update user storage usage
    const user = await this.userService.findById(userId);
    if (user) {
      const currentStorage = Number(user.storageUsed) || 0;
      const newStorageUsed = Math.max(0, currentStorage - document.size);
      await this.userService.update(userId, {
        storageUsed: newStorageUsed,
      });
    }

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

    // Add job to queue for processing
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

    // Add job to queue for title generation
    await this.queueService.addTitleGenerationJob({
      documentId: document.id,
      userId: document.userId,
      key: document.path,
      originalName: document.originalName,
    });

    return document;
  }
}
