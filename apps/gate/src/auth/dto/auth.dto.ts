import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UserOAuthCreateDto {
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;

  @IsOptional()
  firstName?: string;

  @IsOptional()
  lastName?: string;

  @IsOptional()
  picture?: string;

  @IsString()
  googleId: string;
}

export class GoogleVerifyDto {
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;

  @IsString()
  firstName?: string;

  @IsString()
  lastName?: string;

  @IsString()
  picture?: string;

  @IsString()
  googleAccessToken: string;
}

export class RequestOtpDto {
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;
}

export class VerifyOtpDto {
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;

  @IsString()
  otp: string;
}
