import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'noAsciiControlCharacters', async: false })
class NoAsciiControlCharactersConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return [...value].every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
    });
  }

  defaultMessage(): string {
    return 'returnTo cannot contain ASCII control characters';
  }
}

export class OauthStartQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^\/(?!\/)[^\\]*$/u, {
    message: 'returnTo must be a relative application path',
  })
  @Validate(NoAsciiControlCharactersConstraint)
  returnTo = '/app';
}
