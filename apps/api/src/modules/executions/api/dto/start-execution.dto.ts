import { EXECUTION_MESSAGE_MAX_LENGTH } from '@alfred/contracts';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length } from 'class-validator';
import { normalizedText, trimmedString } from '../../../../common/validation/text-input';

export class StartExecutionDto {
  @IsUUID()
  submissionId!: string;

  @Transform(({ value }: { value: unknown }) => normalizedText(trimmedString(value)))
  @IsString()
  @Length(1, EXECUTION_MESSAGE_MAX_LENGTH)
  message!: string;
}
