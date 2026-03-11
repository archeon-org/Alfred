import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Template display name',
    example: 'Finance Starter',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Template description',
    example: 'Starter structure for finance documents',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Template icon identifier',
    example: 'wallet',
  })
  @IsString()
  @IsNotEmpty()
  icon: string;
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {
  @ApiPropertyOptional({
    description: 'Template display name',
    example: 'Updated Finance Starter',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Template description',
    example: 'Updated starter structure for finance documents',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Template icon identifier',
    example: 'bank',
  })
  @IsOptional()
  @IsString()
  icon?: string;
}
