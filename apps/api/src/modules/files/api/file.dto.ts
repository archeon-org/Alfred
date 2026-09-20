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
import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    description:
      'Text looked for in the name and in the description of a file, anywhere in them, without regard to case. Trimmed; `%`, `_` and `\\` are ordinary characters, not wildcards; a blank value filters nothing. Example: `contrat`.',
    maxLength: FILE_SEARCH_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(text)
  @IsString()
  @MaxLength(FILE_SEARCH_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Keep one kind of file, as detected from its bytes. `image` covers PNG, JPEG, WebP and GIF. Example: `pdf`.',
    enum: ['pdf', 'docx', 'image'],
  })
  @IsOptional()
  @IsIn(['pdf', 'docx', 'image'])
  kind?: FileKind;

  @ApiPropertyOptional({
    description:
      'Keep the files in one processing state: `ready` for those a message can carry, `processing` to follow recent uploads, `failed` for those that could not be read. Example: `ready`.',
    enum: ['processing', 'ready', 'failed'],
  })
  @IsOptional()
  @IsIn(['processing', 'ready', 'failed'])
  readiness?: FileReadiness;

  @ApiPropertyOptional({
    description:
      'Keep the files placed directly in one folder, sub-folders excluded: a folder identifier (UUID), or the word `root` for the top level; case is ignored, anything else is a `400`. Omitted, the whole library is listed whatever the folder. A folder that does not exist, or belongs to another account, answers an empty list. Example: `root`.',
  })
  @IsOptional()
  @Matches(UUID_OR_ROOT)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  /** A folder identifier, or `root` for the top level. */
  folderId?: string;

  @ApiPropertyOptional({
    description:
      'Keep the files that were sent as attachments in this conversation. A conversation that does not exist, or belongs to another account, answers an empty list. Example: `2b7e9c40-6a1d-4f35-8e92-d0c4b5a6f718`.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({
    description:
      'Keep the files that carry this label. The whole label, with its exact case: no prefix match, no wildcard. Trimmed. Example: `juridique`.',
    minLength: 1,
    maxLength: FILE_TAG_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(text)
  @IsString()
  @Length(1, FILE_TAG_MAX_LENGTH)
  tag?: string;
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
