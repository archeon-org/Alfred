import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Address, UserPreferencesUpdate } from '@archeon-org/types';
import { Type } from 'class-transformer';

export class AddressDto implements Address {
  @ApiProperty({ description: 'Street address', example: '123 Main St' })
  @IsString()
  street: string;

  @ApiProperty({ description: 'City', example: 'Paris' })
  @IsString()
  city: string;

  @ApiProperty({ description: 'State or province', example: 'Île-de-France' })
  @IsString()
  state: string;

  @ApiProperty({ description: 'Postal/ZIP code', example: '75001' })
  @IsString()
  zipCode: string;

  @ApiProperty({ description: 'Country', example: 'France' })
  @IsString()
  country: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'User first name', example: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'User last name', example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+33612345678',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Profile picture URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  profilePicture?: string;

  @ApiPropertyOptional({
    description: 'User address',
    type: AddressDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  @IsObject()
  address?: AddressDto;

  @ApiPropertyOptional({
    description: 'User preferences',
    example: { notifications: true, theme: 'dark' },
  })
  @IsOptional()
  @IsObject()
  preferences?: UserPreferencesUpdate;

  @ApiPropertyOptional({
    description: 'Push notification token (FCM/APNS)',
    example: 'ExponentPushToken[xxx]',
  })
  @IsOptional()
  @IsString()
  pushToken?: string;

  @ApiPropertyOptional({
    description: 'Storage used in bytes',
    example: 1048576,
  })
  @IsOptional()
  @IsNumber()
  storageUsed?: number;

  @ApiPropertyOptional({
    description: 'Whether user has completed onboarding',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isOnboarded?: boolean;
}
