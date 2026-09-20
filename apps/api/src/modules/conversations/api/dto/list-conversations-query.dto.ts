import type { ProjectKind } from '@alfred/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../../../../common/pagination/list-query.dto';

/** With `projectId`, lists that project's chats; without it, every recent chat of the caller. */
export class ListConversationsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description: 'Page size. This route defaults to 10, not to the usual 20. Example: `25`.',
    default: 10,
    minimum: 1,
    maximum: 100,
    type: 'integer',
  })
  override limit = 10;

  @ApiPropertyOptional({
    description:
      'Keep only standalone chats (`implicit`) or only chats of named projects (`named`). Combines with `projectId` by AND. Example: `implicit`.',
    enum: ['implicit', 'named'],
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['implicit', 'named'])
  projectKind?: ProjectKind;

  @ApiPropertyOptional({
    description:
      'Keep only the chats of this project, which the signed-in account must own. An unknown or foreign project answers `404`; a value that is not a UUID answers `400`. Example: `3f0c6c0e-9c7b-4f2a-9a58-2d5a1c7e8b41`.',
    format: 'uuid',
    type: String,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  projectId?: string;
}
