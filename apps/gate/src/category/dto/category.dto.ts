import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsHexColor } from 'class-validator';

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
}

export class UpdateCategoryDto extends CreateCategoryDto {}
