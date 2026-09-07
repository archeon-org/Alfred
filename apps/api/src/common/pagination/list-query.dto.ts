import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class ListQueryDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^[0-9]+$/u.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
