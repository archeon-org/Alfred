import { IsUUID } from 'class-validator';

export class MoveConversationDto {
  @IsUUID()
  projectId!: string;
}
