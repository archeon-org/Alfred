import { AGENT_SEARCH_MAX_LENGTH } from '@alfred/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, NotContains, ValidateIf } from 'class-validator';
import { ListQueryDto } from '../../../common/pagination/list-query.dto';

export class AgentListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description:
      'Free-text filter. Case and accents are ignored; `_` and `-` count as spaces, in the search and in the agent text: `elastic_rag`, `elastic-rag` and `elastic rag` are the same search (two terms, `elastic` and `rag`), while `elasticrag` does not find `elastic_rag`. The text is split on whitespace and every term must appear (substring match) in the name, the graph identifier, the short description, the description or a tag of the agent; two terms may match two different fields. Omitted, empty, blank or made only of `_` and `-`: the whole catalog. No NUL character, and the parameter is sent once. A cursor is only valid with the search it was issued for. Example: `infra topo`.',
    maxLength: AGENT_SEARCH_MAX_LENGTH,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(AGENT_SEARCH_MAX_LENGTH)
  @NotContains('\0')
  search?: string;
}
