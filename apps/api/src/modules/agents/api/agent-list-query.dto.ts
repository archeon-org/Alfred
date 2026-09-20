import { AGENT_SEARCH_MAX_LENGTH } from '@alfred/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, NotContains, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

export class AgentListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description:
      'Free-text filter. Case, accents, `_` and `-` are ignored. The text is split on whitespace and every term must appear (substring match) in the name, the graph identifier, the short description, the description or a tag of the agent; two terms may match two different fields. Omitted, empty or blank: the whole catalog. No NUL character. A cursor is only valid with the search it was issued for. Example: `infra topo`.',
    maxLength: AGENT_SEARCH_MAX_LENGTH,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(AGENT_SEARCH_MAX_LENGTH)
  @NotContains('\0')
  search?: string;
}
