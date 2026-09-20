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
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(160)
  @NotContains('\0')
  search?: string;
}

export class PublishedSkillListQueryDto extends ListQueryDto {
  /** Exact published name, the one a consumer mounts the skill under. */
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
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  before?: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
