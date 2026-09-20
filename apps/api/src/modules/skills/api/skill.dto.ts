import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotContains,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';
export class SkillFileDto {
  @IsString() @MinLength(1) @MaxLength(240) path!: string;
  @IsString() @MaxLength(1398104) contentBase64!: string;
  @IsString() @MinLength(1) @MaxLength(127) mediaType!: string;
}
export class SkillWriteDto {
  @IsString() @MaxLength(64) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) name!: string;
  @IsString() @MinLength(1) @MaxLength(1024) description!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SkillFileDto)
  files!: SkillFileDto[];
}
export class SkillVersionDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}
export class SkillUpdateDto extends SkillWriteDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}
export class SkillListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description:
      'Text looked for anywhere in the name or the description, ignoring case. `%`, `_` and `\\` are ordinary characters, not wildcards. An empty value does not filter. Example: `incident`.',
    maxLength: 160,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(160)
  @NotContains('\0')
  search?: string;
}

export class PublishedSkillListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description:
      'Exact published name, the one a consumer mounts the skill under. Not a search: no wildcard, no prefix match. Example: `incident-runbook`.',
    maxLength: 64,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  name?: string;
}

export class SkillRestoreDto extends SkillVersionDto {
  @IsInt() @Min(1) @Max(2147483647) sourceVersion!: number;
}
export class SkillAvailabilityDto extends SkillVersionDto {
  @IsBoolean() enabled!: boolean;
}
export class SkillVersionsQueryDto {
  @ApiPropertyOptional({
    description:
      'Only snapshots with a lower number than this one: the `nextBefore` of the previous page, sent back unchanged. Omit it for the first page. Example: `12`.',
    type: 'integer',
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  before?: number;
  @ApiPropertyOptional({
    description: 'Page size. Example: `50`.',
    default: 20,
    minimum: 1,
    maximum: 100,
    type: 'integer',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
