import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { findOwnedOrThrow } from '../../../common/ownership/find-owned';
import { OwnedResourceNotFoundException } from '../../../common/ownership/owned-resource-not-found.exception';
import { ConversationEntity } from '../../conversations/infrastructure/persistence/conversation.entity';
import { assertProjectWritable } from '../../projects/application/project-state';
import { ProjectEntity } from '../../projects/infrastructure/persistence/project.entity';
import { UserEntity } from '../../users/user.entity';
import type { ContextScope } from '../domain/context-document';

/** Single trusted mapping for CRUD and future runtime resolution. Caller owns the transaction. */
@Injectable()
export class ContextScopeService {
  async authorize(
    manager: EntityManager,
    principal: AuthPrincipal,
    projectId?: string,
    write = false,
  ): Promise<ContextScope> {
    const user = await manager.getRepository(UserEntity).findOne({
      where: { id: principal.id, status: 'active' },
      ...(write && projectId === undefined ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!user) throw new UnauthorizedException('Account is unavailable');
    if (projectId === undefined) return { type: 'personal', id: user.id };
    const project = await findOwnedOrThrow(
      manager.getRepository(ProjectEntity),
      { id: projectId, ownerUserId: user.id, tenantId: user.tenantId },
      'project',
      write ? { lock: { mode: 'pessimistic_write' } } : {},
    );
    if (write) assertProjectWritable(project);
    return { type: 'project', id: project.id };
  }
  async conversation(
    manager: EntityManager,
    principal: AuthPrincipal,
    conversationId: string,
  ): Promise<ContextScope> {
    const personal = await this.authorize(manager, principal);
    const user = await manager.getRepository(UserEntity).findOneByOrFail({ id: personal.id });
    const conversation = await manager.getRepository(ConversationEntity).findOne({
      where: { id: conversationId, project: { ownerUserId: user.id, tenantId: user.tenantId } },
    });
    if (!conversation) throw new OwnedResourceNotFoundException('conversation');
    return { type: 'project', id: conversation.projectId };
  }
}
