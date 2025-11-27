import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  ProcessDocumentJobData,
  GenerateTitleJobData,
  GenerateEmbeddingJobData,
} from '@archeon-org/types';
import {
  DocumentEntity,
  ProcessingStatus,
  CategoryEntity,
  TagEntity,
} from '@archeon-org/database';

import { OCRService } from '../ocr/ocr.service';
import { NotificationService, R2Service } from '@archeon-org/module';
import { ClassificationService } from '../classification/classification.service';
import { EmbeddingService } from '../embedding/embedding.service';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    private readonly r2Service: R2Service,
    private readonly ocrService: OCRService,
    private readonly classificationService: ClassificationService,
    private readonly embeddingService: EmbeddingService,
    private notificationService: NotificationService,
  ) {}

  async processDocument(data: ProcessDocumentJobData): Promise<void> {
    this.logger.log(
      `Starting processing logic for document: ${data.documentId}`,
    );
    this.logger.debug(`User ID: ${data.userId}`);
    this.logger.debug(`Storage Key: ${data.key}`);

    // Update status to PROCESSING
    await this.documentRepository.update(data.documentId, {
      processingStatus: ProcessingStatus.PROCESSING,
    });

    try {
      // 1. Download file from R2
      this.logger.log(`Downloading file from R2: ${data.key}`);
      const fileBuffer = await this.r2Service.getFile(data.key);

      // 2. Perform OCR
      this.logger.log(`Performing OCR on document: ${data.documentId}`);
      const text = await this.ocrService.recognize(fileBuffer);
      this.logger.log(`OCR completed. Extracted ${text.length} characters.`);

      // 3. AI Classification
      this.logger.log(
        `Starting AI classification for document: ${data.documentId}`,
      );

      // Fetch user's categories and tags
      const [categories, tags] = await Promise.all([
        this.categoryRepository.find({ where: { userId: data.userId } }),
        this.tagRepository.find({ where: { userId: data.userId } }),
      ]);

      this.logger.debug(
        `Found ${categories.length} categories and ${tags.length} tags for user ${data.userId}`,
      );

      const classificationResult =
        await this.classificationService.classifyDocument(
          text,
          categories.map((c) => ({ id: c.id, name: c.name })),
          tags.map((t) => ({ id: t.id, name: t.name })),
          data.originalName,
        );

      // Handle AI-suggested new category creation
      let finalCategoryId = classificationResult.categoryId;
      if (!finalCategoryId && classificationResult.newCategory) {
        this.logger.log(
          `AI suggested new category: "${classificationResult.newCategory.name}" with icon "${classificationResult.newCategory.icon}" and color "${classificationResult.newCategory.color}"`,
        );
        // Create the new category with AI-provided details
        const newCategory = this.categoryRepository.create({
          name: classificationResult.newCategory.name,
          icon: classificationResult.newCategory.icon,
          color: classificationResult.newCategory.color,
          userId: data.userId,
          isSystemDefault: true, // Mark as AI-created
        });
        const savedCategory = await this.categoryRepository.save(newCategory);
        finalCategoryId = savedCategory.id;
        this.logger.log(
          `Created new category "${classificationResult.newCategory.name}" with ID: ${finalCategoryId}`,
        );
      }

      // Prepare update data
      const updateData: Partial<DocumentEntity> = {
        content: text,
        processingStatus: ProcessingStatus.COMPLETED,
        isProcessed: true,
        classificationSource: 'AI',
        title: classificationResult.title,
      };

      if (finalCategoryId) {
        updateData.categoryId = finalCategoryId;
      }

      this.logger.log(
        `Updating document ${data.documentId} with category: ${
          finalCategoryId || 'None'
        } and tags: ${classificationResult.tagIds.join(', ') || 'None'}`,
      );

      // 4. Update document with content and classification
      // We use save() instead of update() to handle ManyToMany relations (tags)
      const document = await this.documentRepository.findOne({
        where: { id: data.documentId },
      });
      if (document) {
        Object.assign(document, updateData);

        if (classificationResult.tagIds.length > 0) {
          const selectedTags = await this.tagRepository.findBy({
            id: In(classificationResult.tagIds),
          });
          document.tags = selectedTags;
        }

        await this.documentRepository.save(document);
      } else {
        // Fallback if document not found (shouldn't happen)
        await this.documentRepository.update(data.documentId, updateData);
      }

      // 5. Generate embedding for semantic search
      this.logger.log(`Generating embedding for document: ${data.documentId}`);
      try {
        await this.embeddingService.createOrUpdateEmbedding(
          data.documentId,
          data.userId,
          text,
        );
        this.logger.log(
          `Successfully generated embedding for document: ${data.documentId}`,
        );
      } catch (embeddingError) {
        // Log but don't fail the entire process if embedding fails
        this.logger.error(
          `Failed to generate embedding for document ${data.documentId}`,
          embeddingError instanceof Error
            ? embeddingError.stack
            : String(embeddingError),
        );
      }

      this.logger.log(
        `Successfully processed and classified document: ${data.documentId}`,
      );

      // 6. Send success notification
      await this.notificationService.create({
        userId: data.userId,
        title: 'Document Processed',
        message: `"${classificationResult.title}" has been successfully processed and classified.`,
        redirect: `/(app)/documents/${data.documentId}`,
        data: {
          documentId: data.documentId,
          url: `/(app)/documents/${data.documentId}`,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Update status to FAILED
      await this.documentRepository.update(data.documentId, {
        processingStatus: ProcessingStatus.FAILED,
      });

      // 7. Send failure notification
      await this.notificationService.create({
        userId: data.userId,
        title: 'Document Processing Failed',
        message: 'There was an error processing your document.',
        redirect: `/(app)/documents/${data.documentId}`,
        data: { documentId: data.documentId },
      });

      throw error;
    }
  }

  /**
   * Generate only a title for a document using AI
   * Used for manual uploads where user wants AI-generated title
   */
  async generateDocumentTitle(data: GenerateTitleJobData): Promise<void> {
    this.logger.log(
      `Starting title generation for document: ${data.documentId}`,
    );

    try {
      // 1. Get document to check if it has content already
      const document = await this.documentRepository.findOne({
        where: { id: data.documentId },
        select: ['id', 'content', 'originalName'],
      });

      if (!document) {
        throw new Error(`Document ${data.documentId} not found`);
      }

      let text = document.content;

      // 2. If no content exists, perform OCR
      if (!text) {
        this.logger.log(
          `No content found, performing OCR for document: ${data.documentId}`,
        );
        const fileBuffer = await this.r2Service.getFile(data.key);
        text = await this.ocrService.recognize(fileBuffer);

        // Save the extracted content
        await this.documentRepository.update(data.documentId, {
          content: text,
        });
      }

      // 3. Generate title using AI
      const titleResult = await this.classificationService.generateTitle(
        text,
        data.originalName || document.originalName,
      );

      // 4. Update document with the new title
      await this.documentRepository.update(data.documentId, {
        title: titleResult.title,
      });

      this.logger.log(
        `Successfully generated title for document ${data.documentId}: "${titleResult.title}"`,
      );

      // 5. Send success notification
      await this.notificationService.create({
        userId: data.userId,
        title: 'Title Generated',
        message: `Your document has been renamed to "${titleResult.title}".`,
        redirect: `/(app)/documents/${data.documentId}`,
        data: {
          documentId: data.documentId,
          url: `/(app)/documents/${data.documentId}`,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate title for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Send failure notification
      await this.notificationService.create({
        userId: data.userId,
        title: 'Title Generation Failed',
        message: 'There was an error generating a title for your document.',
        redirect: `/(app)/documents/${data.documentId}`,
        data: { documentId: data.documentId },
      });

      throw error;
    }
  }

  /**
   * Generate only an embedding for a document (no classification)
   * Used for manually classified documents where user wants to enable semantic search
   */
  async generateDocumentEmbedding(
    data: GenerateEmbeddingJobData,
  ): Promise<void> {
    this.logger.log(
      `Starting embedding generation for document: ${data.documentId}`,
    );

    try {
      // 1. Get document to check if it has content already
      const document = await this.documentRepository.findOne({
        where: { id: data.documentId },
        select: ['id', 'content', 'title'],
      });

      if (!document) {
        throw new Error(`Document ${data.documentId} not found`);
      }

      let text = document.content;

      // 2. If no content exists, perform OCR
      if (!text) {
        this.logger.log(
          `No content found, performing OCR for document: ${data.documentId}`,
        );
        const fileBuffer = await this.r2Service.getFile(data.key);
        text = await this.ocrService.recognize(fileBuffer);

        // Save the extracted content
        await this.documentRepository.update(data.documentId, {
          content: text,
        });
      }

      // 3. Generate embedding for semantic search
      this.logger.log(`Generating embedding for document: ${data.documentId}`);
      await this.embeddingService.createOrUpdateEmbedding(
        data.documentId,
        data.userId,
        text,
      );

      this.logger.log(
        `Successfully generated embedding for document ${data.documentId}`,
      );

      // 4. Send success notification
      await this.notificationService.create({
        userId: data.userId,
        title: 'Search Enabled',
        message: `"${document.title || 'Your document'}" can now be found through search.`,
        redirect: `/(app)/documents/${data.documentId}`,
        data: {
          documentId: data.documentId,
          url: `/(app)/documents/${data.documentId}`,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding for document ${data.documentId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Send failure notification
      await this.notificationService.create({
        userId: data.userId,
        title: 'Search Enabling Failed',
        message: 'There was an error enabling search for your document.',
        redirect: `/(app)/documents/${data.documentId}`,
        data: { documentId: data.documentId },
      });

      throw error;
    }
  }
}
