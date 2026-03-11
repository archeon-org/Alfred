import { ProcessingStatus } from '@archeon-org/database';
import {
  OptionalBooleanField,
  OptionalEnumField,
  OptionalJsonField,
  OptionalStringField,
  OptionalUuidArrayField,
  OptionalUuidField,
  UuidArrayField,
  UuidField,
} from '../../common/decorators/api-field.decorator';

export class CreateDocumentDto {
  @OptionalStringField({
    description: 'Document title',
    example: 'My Invoice',
  })
  title?: string;

  @OptionalStringField({
    description: 'Document description',
    example: 'Invoice from Amazon for laptop purchase',
  })
  description?: string;

  @OptionalUuidField({
    description: 'Category UUID to assign to document',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  categoryId?: string;

  @OptionalUuidArrayField({
    description: 'Array of tag UUIDs to assign to document',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174001'],
  })
  tagIds?: string[];

  @OptionalJsonField({
    description: 'Additional metadata as JSON',
    example: { vendor: 'Amazon', amount: 1299.99 },
  })
  metadata?: Record<string, any>;
}

export class UpdateDocumentDto extends CreateDocumentDto {
  @OptionalEnumField(ProcessingStatus, {
    description: 'Document processing status',
    enum: ProcessingStatus,
    example: 'completed',
  })
  processingStatus?: ProcessingStatus;

  @OptionalBooleanField({
    description: 'Whether document has been fully processed',
    example: true,
  })
  isProcessed?: boolean;
}

export class BulkUpdateCategoryDto {
  @UuidArrayField({
    description: 'Array of document UUIDs to update',
    type: [String],
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
  })
  documentIds: string[];

  @UuidField({
    description: 'Category UUID to assign to all documents',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  categoryId: string;
}
