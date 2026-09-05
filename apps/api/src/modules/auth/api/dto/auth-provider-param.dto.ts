import { IsString, Matches, MaxLength } from 'class-validator';

export class AuthProviderParamDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9-]*$/u)
  provider!: string;
}
