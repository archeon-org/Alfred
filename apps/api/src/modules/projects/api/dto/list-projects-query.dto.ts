import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../../../../common/pagination/list-query.dto';

/** `pinned=true` lists pinned projects in pin order; `pinned=false` the others; omitted, all. */
export class ListProjectsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description:
      'Which projects to list. `true`: only the pinned projects, oldest pin first, all in one answer (`limit` and `cursor` are not used, `nextCursor` is `null`). `false`: only the projects that are not pinned, most recently updated first, paged. Omitted: every project, pinned or not, most recently updated first, paged. Only the exact strings `true` and `false` are accepted. Example: `true`.',
    type: 'boolean',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  pinned?: boolean;
}
