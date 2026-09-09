import { CONVERSATION_TITLE_MAX_LENGTH, RESOURCE_NAME_PATTERN } from '@alfred/contracts';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trimmedString } from '../../../../common/validation/text-input';

export class UpdateConversationDto {
  @Transform(({ value }: { value: unknown }) => trimmedString(value))
  @IsString()
  @Length(1, CONVERSATION_TITLE_MAX_LENGTH)
  @Matches(RESOURCE_NAME_PATTERN)
  title!: string;
}
