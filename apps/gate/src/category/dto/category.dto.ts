import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsHexColor,
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Medical',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Icon identifier',
    example: 'medical-bag',
  })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Category color in hex format',
    example: '#FF5733',
  })
  @IsHexColor()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({
    description: 'Parent category UUID for nested category',
    example: '2ecf8a44-61ff-4a27-8f0e-aec166f67a58',
  })
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Display order inside a folder level',
    example: 1,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
