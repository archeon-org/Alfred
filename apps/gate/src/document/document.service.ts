import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DocumentRepository } from './document.repository';
import { DocumentEntity } from './document.entity';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { R2Service } from '../common/r2/r2.service';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly r2Service: R2Service,
  ) {}

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentEntity> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileExtension = path.extname(file.originalname);
    const key = `${userId}/${uuidv4()}${fileExtension}`;

    try {
      await this.r2Service.uploadFile(key, file.buffer, file.mimetype);

      const document = await this.documentRepository.create({
        userId,
        filename: key,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: key,
        title: file.originalname,
      });

      return document;
    } catch (error) {
      this.logger.error(
        `Failed to upload file to R2: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to upload file');
    }
  }

  async getUserDocuments(userId: string): Promise<DocumentEntity[]> {
    return this.documentRepository.findByUserId(userId);
  }

  async getDocumentWithUrl(
    userId: string,
    documentId: string,
  ): Promise<{ document: DocumentEntity; url: string }> {
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const url = await this.r2Service.getSignedUrl(document.path);
    return { document, url };
  }
}
