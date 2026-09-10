import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class SaveContextDocumentDto {
  @IsString()
  @MaxLength(65_536)
  content!: string;
  @IsInt()
  @Min(0)
  @Max(2_147_483_646)
  expectedRevision!: number;
}
