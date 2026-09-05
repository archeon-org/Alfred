import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class OauthCallbackQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/u)
  @MaxLength(16)
  authuser?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  code!: string;

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
  state!: string;
}
