import { EXECUTION_MESSAGE_MAX_LENGTH, FILE_MAX_ATTACHMENTS_PER_MESSAGE } from '@alfred/contracts';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { normalizedText, trimmedString } from '../../../../common/validation/text-input';

/**
 * A message may be attachments only: the text is required when nothing is attached. This is a
 * constraint of its own rather than `@ValidateIf` + `@MinLength`, because `@ValidateIf` switches
 * off *every* validator of the property — type and maximum length included — whenever a file is
 * attached.
 */
@ValidatorConstraint({ name: 'messageOrAttachments', async: false })
class MessageOrAttachmentsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, context: ValidationArguments): boolean {
    const { attachmentIds } = context.object as StartExecutionDto;
    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) return true;
    return typeof value === 'string' && value.length > 0;
  }

  defaultMessage(): string {
    return 'message must not be empty unless a file is attached';
  }
}

export class StartExecutionDto {
  @IsUUID()
  submissionId!: string;

  @Transform(({ value }: { value: unknown }) => normalizedText(trimmedString(value)))
  @IsString()
  @MaxLength(EXECUTION_MESSAGE_MAX_LENGTH)
  @Validate(MessageOrAttachmentsConstraint)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(FILE_MAX_ATTACHMENTS_PER_MESSAGE)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  attachmentIds?: string[];
}
