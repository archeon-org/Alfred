import { IsString, IsOptional, IsHexColor } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsHexColor()
  @IsOptional()
  color?: string;
}

export class UpdateCategoryDto extends CreateCategoryDto {}
