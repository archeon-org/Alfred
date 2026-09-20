import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class ListQueryDto {
  @ApiPropertyOptional({
    description:
      'The `nextCursor` of the previous page, sent back unchanged. Omit it for the first page. A cursor belongs to one route and one set of filters. Example: the `data.nextCursor` of the previous answer.',
    maxLength: 512,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Page size. Example: `50`.',
    default: 20,
    minimum: 1,
    maximum: 100,
    type: 'integer',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^[0-9]+$/u.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
