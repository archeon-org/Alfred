import { Transform } from 'class-transformer';
import { IsBoolean, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../../../../common/pagination/list-query.dto';

/** `pinned=true` lists pinned projects in pin order; `pinned=false` the others; omitted, all. */
export class ListProjectsQueryDto extends ListQueryDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  pinned?: boolean;
}
