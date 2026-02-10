import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsJSON, IsEnum } from 'class-validator';
import { ProcessingStatus } from '@archeon-org/database';

export class CreateDocumentDto {
  @ApiPropertyOptional({
    description: 'Document title',
    example: 'My Invoice',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Document description',
    example: 'Invoice from Amazon for laptop purchase',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Category UUID to assign to document',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Array of tag UUIDs to assign to document',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174001'],
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata as JSON',
    example: { vendor: 'Amazon', amount: 1299.99 },
  })
  @IsOptional()
  @IsJSON()
  metadata?: Record<string, any>;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional({
    description: 'Document title',
    example: 'Updated Invoice Title',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Document description',
    example: 'Updated description for the invoice',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Category UUID to assign to document',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Array of tag UUIDs to assign to document',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174001'],
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata as JSON',
    example: { vendor: 'Amazon', amount: 1299.99 },
  })
  @IsOptional()
  @IsJSON()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Document processing status',
    enum: ProcessingStatus,
    example: 'completed',
  })
  @IsOptional()
  @IsEnum(ProcessingStatus)
  processingStatus?: ProcessingStatus;

  @ApiPropertyOptional({
    description: 'Whether document has been fully processed',
    example: true,
  })
  @IsOptional()
  isProcessed?: boolean;
}

export class BulkUpdateCategoryDto {
  @ApiProperty({
    description: 'Array of document UUIDs to update',
    type: [String],
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
  })
  documentIds: string[];

  @ApiProperty({
    description: 'Category UUID to assign to all documents',
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  categoryId: string;
}
