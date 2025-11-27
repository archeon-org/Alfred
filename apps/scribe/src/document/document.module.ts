import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentService } from './document.service';
import { DocumentProcessor } from './document.processor';
import {
  DocumentEntity,
  DocumentEmbeddingEntity,
  CategoryEntity,
  TagEntity,
  NotificationEntity,
  UserEntity,
} from '@archeon-org/database';
import { R2Module, NotificationService } from '@archeon-org/module';
import { OCRModule } from '../ocr/ocr.module';
import { ClassificationModule } from '../classification/classification.module';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentEmbeddingEntity,
      CategoryEntity,
      TagEntity,
      NotificationEntity,
      UserEntity,
    ]),
    R2Module,
    OCRModule,
    ClassificationModule,
    EmbeddingModule,
  ],
  providers: [DocumentService, DocumentProcessor, NotificationService],
  exports: [DocumentService],
})
export class DocumentModule {}
