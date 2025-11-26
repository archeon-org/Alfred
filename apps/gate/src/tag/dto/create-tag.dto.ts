import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  isSystemDefault?: boolean;
}
