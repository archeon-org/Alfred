import { AGENT_SEARCH_MAX_LENGTH } from '@alfred/contracts';
import { IsString, MaxLength, NotContains, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

export class AgentListQueryDto extends ListQueryDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(AGENT_SEARCH_MAX_LENGTH)
  @NotContains('\0')
  search?: string;
}
