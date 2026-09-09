import type { ProjectKind } from '@alfred/contracts';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../../../../common/pagination/list-query.dto';

/** With `projectId`, lists that project's chats; without it, every recent chat of the caller. */
export class ListConversationsQueryDto extends ListQueryDto {
  override limit = 10;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['implicit', 'named'])
  projectKind?: ProjectKind;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  projectId?: string;
}
