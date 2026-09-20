import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** Documentation only: parameters a provider appends are accepted so its redirect is not refused. */
const NOT_USED = 'Validated, then ignored by Alfred.';

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
  @ApiPropertyOptional({
    description: `Index of the account chosen in the browser, as Google appends it. Digits only. ${NOT_USED} Example: \`0\`.`,
    maxLength: 16,
    pattern: '^\\d+$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/u)
  @MaxLength(16)
  authuser?: string;

  @ApiPropertyOptional({
    description:
      'Authorization code the provider issues after a successful sign-in. Alfred exchanges it once with the provider. Exactly one of `code` and `error` must be present. Example: `fake-authorization-code`.',
    minLength: 1,
    maxLength: 2048,
  })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(2048)
  code?: string;

  @ApiPropertyOptional({
    description:
      'OAuth error code the provider sends instead of `code` when the sign-in did not complete, for instance when the user refuses the consent. Lower-case letters, digits and `_`, starting with a letter. It is handed unchanged to the web application as the `error` of the redirect. Example: `access_denied`.',
    maxLength: 64,
    pattern: '^[a-z][a-z0-9_]{0,63}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/u)
  @MaxLength(64)
  error?: string;

  @ApiPropertyOptional({
    description: `Explanation the provider may send with \`error\`. It can hold personal data, so it is never handed to the web application. ${NOT_USED} Example: \`The user denied the request.\``,
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  error_description?: string;

  @ApiPropertyOptional({
    description: `Google Workspace domain of the chosen account, as Google appends it. ${NOT_USED} The Workspace restriction is checked on the signed ID token, never on this parameter. Example: \`example.test\`.`,
    maxLength: 253,
  })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  hd?: string;

  @ApiPropertyOptional({
    description: `Issuer the provider names in its redirect. An \`https\` URL. ${NOT_USED} Example: \`https://accounts.google.com\`.`,
    format: 'uri',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  iss?: string;

  @ApiPropertyOptional({
    description: `Session state some OpenID Connect providers append. ${NOT_USED} Example: \`fake-session-state\`.`,
    maxLength: 256,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  session_state?: string;

  @ApiPropertyOptional({
    description: `Prompt the provider reports having shown. ${NOT_USED} Example: \`consent\`.`,
    maxLength: 256,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  prompt?: string;

  @ApiPropertyOptional({
    description: `Scopes the provider granted, separated by spaces. ${NOT_USED} Example: \`openid email profile\`.`,
    maxLength: 4096,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  scope?: string;

  @ApiProperty({
    description:
      'The login state created by the start route, which the provider sends back unchanged. It must equal the state cookie, be less than 10 minutes old, never have been used and have been issued for this provider. The example is a placeholder, not a real state.',
    example: 'FAKE-LOGIN-STATE-0000000000000000000000000000',
    minLength: 32,
    maxLength: 256,
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  @Validate(OauthCallbackOutcomeConstraint)
  state!: string;
}
