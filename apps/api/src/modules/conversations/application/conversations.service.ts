import type { Conversation, ProjectKind, UpdateConversationInput } from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager, type Repository } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { deleteOwnedOrThrow, findOwnedOrThrow } from '../../../common/ownership/find-owned';
import { OwnedResourceNotFoundException } from '../../../common/ownership/owned-resource-not-found.exception';
import type { OwnerScope } from '../../../common/ownership/owner-scope';
import { paginateConversations } from '../infrastructure/persistence/paginate-conversations';
import {
  assertProjectNamed,
  assertProjectWritable,
} from '../../projects/application/project-state';
import { PROJECT_RESOURCE } from '../../projects/domain/project';
import { ProjectEntity } from '../../projects/infrastructure/persistence/project.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { CONVERSATION_RESOURCE, initialTitle, toConversationDto } from '../domain/conversation';
import { ConversationEntity } from '../infrastructure/persistence/conversation.entity';

export interface CreateConversationCommand {
  readonly projectId?: string;
  readonly title?: string;
}

export interface ConversationListQuery {
  readonly projectKind?: ProjectKind;
  readonly projectId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ConversationPage {
  readonly items: readonly Conversation[];
  readonly nextCursor: string | null;
}

const ROW_LOCK = { lock: { mode: 'pessimistic_write' } } as const;

// Authorization is inherited from the parent project (ALF-DEC-004 §2); the EXISTS keeps the
// entity query unjoined so cursor pagination stays applicable.
const OWNED_PROJECT_EXISTS = `EXISTS (
  SELECT 1 FROM "api_projects" "owner_project"
  WHERE "owner_project"."id" = "conversation"."project_id"
    AND "owner_project"."tenant_id" = :tenantId
    AND "owner_project"."owner_user_id" = :ownerUserId
    AND "owner_project"."status" = 'active'
)`;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  /** A chat inside a named project, or a standalone chat with its own implicit project (ALF-DEC-034). */
  async create(
    principal: AuthPrincipal,
    command: CreateConversationCommand,
  ): Promise<Conversation> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      const project =
        command.projectId === undefined
          ? await this.createImplicitProject(manager, scope)
          : await this.lockNamedProject(manager, scope, command.projectId);
      const repository = manager.getRepository(ConversationEntity);
      const conversation = await repository.save(
        repository.create({ projectId: project.id, ...initialTitle(command.title) }),
      );
      return toConversationDto(conversation, project.kind);
    });
  }

  async list(principal: AuthPrincipal, query: ConversationListQuery): Promise<ConversationPage> {
    const scope = await this.tenants.scopeFor(principal.id);
    if (query.projectId !== undefined) {
      await findOwnedOrThrow(
        this.dataSource.getRepository(ProjectEntity),
        { id: query.projectId, ...scope },
        PROJECT_RESOURCE,
      );
    }
    const queryBuilder = this.owned(
      this.dataSource.getRepository(ConversationEntity),
      scope,
    ).andWhere('conversation.archivedAt IS NULL');
    if (query.projectId !== undefined) {
      queryBuilder.andWhere('conversation.projectId = :projectId', { projectId: query.projectId });
    }
    if (query.projectKind !== undefined) {
      queryBuilder.andWhere(
        `EXISTS (SELECT 1 FROM "api_projects" "kind_project"
        WHERE "kind_project"."id" = "conversation"."project_id"
          AND "kind_project"."kind" = :projectKind)`,
        { projectKind: query.projectKind },
      );
    }
    const page = await paginateConversations(queryBuilder, {
      cursor: query.cursor,
      limit: query.limit,
    });
    const kinds = await this.projectKinds(page.items.map((item) => item.projectId));
    return {
      items: page.items.map((item) =>
        toConversationDto(item, kinds.get(item.projectId) ?? 'named'),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async get(principal: AuthPrincipal, id: string): Promise<Conversation> {
    const scope = await this.tenants.scopeFor(principal.id);
    const conversation = await this.owned(this.dataSource.getRepository(ConversationEntity), scope)
      .andWhere('conversation.id = :id', { id })
      .getOne();
    if (conversation === null) throw new OwnedResourceNotFoundException(CONVERSATION_RESOURCE);
    const kinds = await this.projectKinds([conversation.projectId]);
    return toConversationDto(conversation, kinds.get(conversation.projectId) ?? 'named');
  }

  /**
   * Deletes the chat; an implicit project that only existed for it is removed in the same
   * transaction. Locks go parent first (project, then conversation), the same order as project
   * deletion whose cascade locks the chats after the project row, so the two never deadlock.
   */
  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const scope = await this.tenants.scopeFor(principal.id);
    await this.dataSource.transaction(async (manager) => {
      const conversations = manager.getRepository(ConversationEntity);
      const { conversation, project } = await this.lockOwned(manager, scope, id);
      const projects = manager.getRepository(ProjectEntity);
      const ownership = { id: project.id, ...scope };
      await conversations.delete({ id: conversation.id, projectId: project.id });
      if (project.kind === 'implicit') {
        const remaining = await conversations.count({ where: { projectId: project.id } });
        if (remaining === 0) await deleteOwnedOrThrow(projects, ownership, PROJECT_RESOURCE);
      }
    });
  }

  async update(
    principal: AuthPrincipal,
    id: string,
    command: UpdateConversationInput,
  ): Promise<Conversation> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      const { conversation, project } = await this.lockOwned(manager, scope, id);
      const updated = await manager.getRepository(ConversationEntity).save({
        ...conversation,
        title: command.title.trim(),
        titleSource: 'user' as const,
      });
      return toConversationDto(updated, project.kind);
    });
  }

  async setPinned(principal: AuthPrincipal, id: string, pinned: boolean): Promise<Conversation> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      const { conversation, project } = await this.lockOwned(manager, scope, id);
      if ((conversation.pinnedAt !== null) === pinned)
        return toConversationDto(conversation, project.kind);
      const updated = await manager.getRepository(ConversationEntity).save({
        ...conversation,
        pinnedAt: pinned ? new Date() : null,
      });
      return toConversationDto(updated, project.kind);
    });
  }

  /** Parent before child; revalidation after waiting prevents writes through a stale relation. */
  private async lockOwned(manager: EntityManager, scope: OwnerScope, id: string) {
    const conversations = manager.getRepository(ConversationEntity);
    const located = await this.owned(conversations, scope)
      .andWhere('conversation.id = :id', { id })
      .getOne();
    if (located === null) throw new OwnedResourceNotFoundException(CONVERSATION_RESOURCE);
    const project = await findOwnedOrThrow(
      manager.getRepository(ProjectEntity),
      { id: located.projectId, ...scope },
      PROJECT_RESOURCE,
      ROW_LOCK,
    );
    assertProjectWritable(project);
    const conversation = await conversations.findOne({
      ...ROW_LOCK,
      where: { id, projectId: project.id },
    });
    if (conversation === null) throw new OwnedResourceNotFoundException(CONVERSATION_RESOURCE);
    return { conversation, project };
  }

  private owned(repository: Repository<ConversationEntity>, scope: OwnerScope) {
    return repository.createQueryBuilder('conversation').where(OWNED_PROJECT_EXISTS, {
      ownerUserId: scope.ownerUserId,
      tenantId: scope.tenantId,
    });
  }

  private async createImplicitProject(
    manager: EntityManager,
    scope: OwnerScope,
  ): Promise<ProjectEntity> {
    const projects = manager.getRepository(ProjectEntity);
    return projects.save(
      projects.create({
        ...scope,
        context: null,
        description: null,
        kind: 'implicit',
        name: null,
        status: 'active',
      }),
    );
  }

  private async lockNamedProject(
    manager: EntityManager,
    scope: OwnerScope,
    projectId: string,
  ): Promise<ProjectEntity> {
    const project = await findOwnedOrThrow(
      manager.getRepository(ProjectEntity),
      { id: projectId, ...scope },
      PROJECT_RESOURCE,
      ROW_LOCK,
    );
    assertProjectWritable(project);
    assertProjectNamed(project);
    return project;
  }

  private async projectKinds(projectIds: readonly string[]): Promise<Map<string, ProjectKind>> {
    const unique = [...new Set(projectIds)];
    if (unique.length === 0) return new Map();
    const projects = await this.dataSource.getRepository(ProjectEntity).find({
      select: { id: true, kind: true },
      where: { id: In(unique) },
    });
    return new Map(projects.map((project) => [project.id, project.kind]));
  }
}
