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
  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  zipCode: string;

  @IsString()
  country: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  profilePicture?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  @IsObject()
  address?: AddressDto;

  @IsOptional()
  @IsObject()
  preferences?: UserPreferencesUpdate;

  @IsOptional()
  @IsString()
  pushToken?: string;

  @IsOptional()
  @IsNumber()
  storageUsed?: number;

  @IsOptional()
  @IsBoolean()
  isOnboarded?: boolean;
}
