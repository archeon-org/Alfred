import {
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Address } from '@archeon-org/types';
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
  preferences?: Record<string, any>;

  @IsOptional()
  @IsString()
  pushToken?: string;
}
