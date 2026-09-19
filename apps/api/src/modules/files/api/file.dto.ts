import {
  FILE_DESCRIPTION_MAX_LENGTH,
  FILE_MAX_TAGS,
  FILE_NAME_MAX_LENGTH,
  FILE_SEARCH_MAX_LENGTH,
  FILE_TAG_MAX_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  type FileKind,
  type FileReadiness,
} from '@alfred/contracts';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { ListQueryDto } from '../../../common/pagination/list-query.dto';
import { normalizedText, trimmedString } from '../../../common/validation/text-input';

const text = ({ value }: { value: unknown }): unknown => normalizedText(trimmedString(value));
const UUID_OR_ROOT =
  /^(root|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;

export class FileListQueryDto extends ListQueryDto {
  @IsOptional() @Transform(text) @IsString() @MaxLength(FILE_SEARCH_MAX_LENGTH) search?: string;
  @IsOptional() @IsIn(['pdf', 'docx', 'image']) kind?: FileKind;
  @IsOptional() @IsIn(['processing', 'ready', 'failed']) readiness?: FileReadiness;

  @IsOptional()
  @Matches(UUID_OR_ROOT)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  /** A folder identifier, or `root` for the top level. */
  folderId?: string;

  @IsOptional() @IsUUID() conversationId?: string;
  @IsOptional() @Transform(text) @IsString() @Length(1, FILE_TAG_MAX_LENGTH) tag?: string;
}

/** The text fields of the multipart upload; the file itself arrives through the interceptor. */
export class FileUploadFieldsDto {
  @IsUUID() uploadId!: string;
  @IsOptional() @IsUUID() folderId?: string;
}

export class FileUpdateDto {
  @IsOptional() @Transform(text) @IsString() @Length(1, FILE_NAME_MAX_LENGTH) name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  folderId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(FILE_MAX_TAGS)
  @IsString({ each: true })
  @Length(1, FILE_TAG_MAX_LENGTH, { each: true })
  tags?: string[];

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(text)
  @IsString()
  @MaxLength(FILE_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

export class FolderCreateDto {
  @Transform(text) @IsString() @Length(1, FOLDER_NAME_MAX_LENGTH) name!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  parentId?: string | null;
}

export class FolderUpdateDto {
  @IsOptional() @Transform(text) @IsString() @Length(1, FOLDER_NAME_MAX_LENGTH) name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  parentId?: string | null;
}
