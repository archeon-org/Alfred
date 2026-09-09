import {
  PROJECT_CONTEXT_MAX_BYTES,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  RESOURCE_NAME_PATTERN,
  RESOURCE_TEXT_PATTERN,
} from '@alfred/contracts';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  MaxByteLength,
  normalizedText,
  trimmedString,
} from '../../../../common/validation/text-input';

export class CreateProjectDto {
  @Transform(({ value }: { value: unknown }) => trimmedString(value))
  @IsString()
  @Length(1, PROJECT_NAME_MAX_LENGTH)
  @Matches(RESOURCE_NAME_PATTERN)
  name!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  @Matches(RESOURCE_TEXT_PATTERN)
  description?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizedText(value))
  @IsString()
  @MaxByteLength(PROJECT_CONTEXT_MAX_BYTES)
  @Matches(RESOURCE_TEXT_PATTERN)
  context?: string;
}
