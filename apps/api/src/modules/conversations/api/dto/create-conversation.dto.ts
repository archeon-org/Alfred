import { CONVERSATION_TITLE_MAX_LENGTH, RESOURCE_NAME_PATTERN } from '@alfred/contracts';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { Omittable, trimmedString } from '../../../../common/validation/text-input';

/** Without `projectId`, the API creates a private implicit project for the chat (ALF-DEC-034 §2). */
export class CreateConversationDto {
  @Omittable()
  @IsUUID()
  projectId?: string;

  @Omittable()
  @Transform(({ value }: { value: unknown }) => trimmedString(value))
  @IsString()
  @Length(1, CONVERSATION_TITLE_MAX_LENGTH)
  @Matches(RESOURCE_NAME_PATTERN)
  title?: string;
}
