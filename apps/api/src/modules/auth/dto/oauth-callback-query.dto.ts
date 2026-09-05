import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'oauthCallbackOutcome', async: false })
class OauthCallbackOutcomeConstraint implements ValidatorConstraintInterface {
  validate(_state: string, { object }: ValidationArguments): boolean {
    const query = object as OauthCallbackQueryDto;
    return (query.code !== undefined) !== (query.error !== undefined);
  }

  defaultMessage(): string {
    return 'OAuth callback must contain exactly one of code or error';
  }
}

export class OauthCallbackQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/u)
  @MaxLength(16)
  authuser?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(2048)
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/u)
  @MaxLength(64)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  error_description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  hd?: string;

  @IsOptional()
  @IsString()
  @IsIn(['https://accounts.google.com'])
  @MaxLength(2048)
  iss?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  scope?: string;

  @IsString()
  @MinLength(32)
  @MaxLength(256)
  @Validate(OauthCallbackOutcomeConstraint)
  state!: string;
}
