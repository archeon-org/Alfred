import { ContextDocumentEntity } from '../../context/infrastructure/context-document.entity';
import type { Conversation, MoveConversationInput } from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { DataSource, Not, type EntityManager } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { OwnedResourceNotFoundException } from '../../../common/ownership/owned-resource-not-found.exception';
import { assertProjectWritable } from '../../projects/application/project-state';
import { PROJECT_RESOURCE } from '../../projects/domain/project';
import { ProjectEntity } from '../../projects/infrastructure/persistence/project.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { assertNoActiveExecutions } from '../../executions/domain/execution-lifecycle';
import { CONVERSATION_RESOURCE, toConversationDto } from '../domain/conversation';
import { ConversationEntity } from '../infrastructure/persistence/conversation.entity';
import { assertConversationMoveSource, moveNotAllowed } from './conversation-move-state';

const ROW_LOCK = { lock: { mode: 'pessimistic_write' } } as const;

@Injectable()
export class ConversationMoveService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  async move(
    principal: AuthPrincipal,
    id: string,
    command: MoveConversationInput,
  ): Promise<Conversation> {
    const scope = await this.tenants.scopeFor(principal.id);
    const targetId = command.projectId.toLowerCase();
    return this.dataSource.transaction(async (manager) => {
      const located = await this.owned(manager, scope, id);
      const projects = await this.lockProjects(manager, scope, located.projectId, targetId);
      const target = projects.get(targetId);
      if (!target) throw new OwnedResourceNotFoundException(PROJECT_RESOURCE);
      assertProjectWritable(target);
      if (target.kind !== 'named') throw moveNotAllowed();

      // A competing transfer can delete the initial shell while this transaction waits.
      // Re-read ownership before taking a child lock, and only lock children of locked parents.
      const latest = await this.owned(manager, scope, id);
      if (!projects.has(latest.projectId)) throw moveNotAllowed();
      const conversations = manager.getRepository(ConversationEntity);
      const conversation = await conversations.findOne({
        ...ROW_LOCK,
        where: { id, projectId: latest.projectId },
      });
      if (!conversation) throw new OwnedResourceNotFoundException(CONVERSATION_RESOURCE);
      if (conversation.archivedAt !== null)
        throw new ApiException(409, 'conversation_archived', 'Conversation is archived.');
      if (conversation.projectId === target.id) return toConversationDto(conversation, target.kind);
      await assertNoActiveExecutions(manager, [conversation.id]);
      const source = projects.get(conversation.projectId);
      if (!source || conversation.projectId !== located.projectId) throw moveNotAllowed();
      assertProjectWritable(source);
      assertConversationMoveSource(
        source,
        await conversations.countBy({ projectId: source.id }),
        await manager
          .getRepository(ContextDocumentEntity)
          .existsBy({ projectId: source.id, content: Not('') }),
      );

      // Explicitly retain updated_at and its PostgreSQL microseconds: a move changes the FK only.
      await conversations
        .createQueryBuilder()
        .update()
        .set({ projectId: target.id, updatedAt: () => '"updated_at"' })
        .where('id = :id AND project_id = :sourceId', { id, sourceId: source.id })
        .execute();
      await manager.getRepository(ProjectEntity).delete({ id: source.id, ...scope });
      return toConversationDto({ ...conversation, projectId: target.id }, target.kind);
    });
  }

  private async owned(
    manager: EntityManager,
    scope: OwnerScope,
    id: string,
  ): Promise<ConversationEntity> {
    const conversation = await manager.getRepository(ConversationEntity).findOne({
      where: { id, project: { ...scope } },
    });
    if (!conversation) throw new OwnedResourceNotFoundException(CONVERSATION_RESOURCE);
    return conversation;
  }

  /** Sorted UUID order precedes every conversation lock, including retries after a transfer. */
  private async lockProjects(
    manager: EntityManager,
    scope: OwnerScope,
    sourceId: string,
    targetId: string,
  ): Promise<Map<string, ProjectEntity>> {
    const projects = new Map<string, ProjectEntity>();
    for (const id of [...new Set([sourceId, targetId])].sort()) {
      const project = await manager
        .getRepository(ProjectEntity)
        .findOne({ ...ROW_LOCK, where: { id, ...scope } });
      if (project) projects.set(id, project);
    }
    return projects;
  }
}
