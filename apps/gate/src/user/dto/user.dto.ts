import { IsOptional, IsString, IsNumber, IsObject } from 'class-validator';
import { Address } from '@archeon-org/types';

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
  @IsObject()
  address?: Address;
}
