import { IsOptional, IsString, IsUUID, IsJSON, IsEnum } from 'class-validator';
import { ProcessingStatus } from '@archeon-org/database';

export class CreateDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsJSON()
  metadata?: Record<string, any>;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsJSON()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsEnum(ProcessingStatus)
  processingStatus?: ProcessingStatus;

  @IsOptional()
  isProcessed?: boolean;
}
