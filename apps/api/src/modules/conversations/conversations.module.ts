import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from '../projects/infrastructure/persistence/project.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { ConversationsController } from './api/conversations.controller';
import { ConversationsService } from './application/conversations.service';
import { ConversationEntity } from './infrastructure/persistence/conversation.entity';

@Module({
  imports: [TenantsModule, TypeOrmModule.forFeature([ConversationEntity, ProjectEntity])],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
