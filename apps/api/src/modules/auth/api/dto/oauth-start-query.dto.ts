import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    description:
      'Where the web application lands once signed in: a path of the web application, which may carry a query string. It must start with a single `/` and hold no backslash and no ASCII control character (U+0000 to U+001F, U+007F). An absolute URL or a `//host` form is refused, so a sign-in link can never send the user to another site. Example: `/app/team?tab=agents`.',
    default: '/app',
    maxLength: 2048,
    pattern: '^/(?!/)[^\\\\]*$',
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^\/(?!\/)[^\\]*$/u, {
    message: 'returnTo must be a relative application path',
  })
  @Validate(NoAsciiControlCharactersConstraint)
  returnTo = '/app';
}
