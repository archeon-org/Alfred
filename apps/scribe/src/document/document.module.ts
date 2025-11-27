import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentService } from './document.service';
import { DocumentProcessor } from './document.processor';
import {
  DocumentEntity,
  CategoryEntity,
  TagEntity,
} from '@archeon-org/database';
import { R2Module, NotificationModule } from '@archeon-org/module';
import { OCRModule } from '../ocr/ocr.module';
import { ClassificationModule } from '../classification/classification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, CategoryEntity, TagEntity]),
    R2Module,
    OCRModule,
    NotificationModule,
    ClassificationModule,
  ],
  providers: [DocumentService, DocumentProcessor],
  exports: [DocumentService],
})
export class DocumentModule {}
