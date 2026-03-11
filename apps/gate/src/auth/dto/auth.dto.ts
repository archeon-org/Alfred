import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UserOAuthCreateDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;

  @ApiPropertyOptional({
    description: 'User first name',
    example: 'John',
  })
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'User last name',
    example: 'Doe',
  })
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'URL to user profile picture',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  profilePicture?: string;

  @ApiProperty({
    description: 'Google user ID',
    example: '123456789012345678901',
  })
  @IsString()
  googleId: string;
}

export class GoogleVerifyDto {
  @ApiProperty({
    description: 'User email from Google account',
    example: 'user@gmail.com',
    format: 'email',
  })
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;

  @ApiPropertyOptional({
    description: 'User first name from Google profile',
    example: 'John',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'User last name from Google profile',
    example: 'Doe',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Profile picture URL from Google',
    example: 'https://lh3.googleusercontent.com/a/...',
  })
  @IsOptional()
  @IsString()
  picture?: string;

  @ApiProperty({
    description: 'Access token received from Google OAuth',
    example: 'ya29.a0AfB_byC...',
  })
  @IsString()
  googleAccessToken: string;
}

export class RequestOtpDto {
  @ApiProperty({
    description: 'Email address to send OTP to',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Email address associated with the OTP',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: "The email isn't valid" })
  email: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  otp: string;
}
