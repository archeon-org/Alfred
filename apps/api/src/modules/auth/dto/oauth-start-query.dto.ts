import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class OauthStartQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^\/(?!\/)[^\\\r\n]*$/u, { message: 'returnTo must be a relative application path' })
  returnTo = '/app';
}
