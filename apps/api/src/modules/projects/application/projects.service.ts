import { ConfigService } from '@nestjs/config';
import { TypeOrmContextRepository } from '../../context/infrastructure/typeorm-context.repository';
import { normalizeContextContent } from '../../context/domain/context-document';
import { PROJECT_PIN_LIMIT, type Project } from '@alfred/contracts';
import { Injectable, Optional } from '@nestjs/common';
import { DataSource, IsNull, Not, type EntityManager, type Repository } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import {
  deleteOwnedOrThrow,
  findOwnedOrThrow,
  updateOwnedOrThrow,
} from '../../../common/ownership/find-owned';
import { paginateByCursor } from '../../../common/pagination/paginate';
import { TenantsService } from '../../tenants/tenants.service';
import { ConversationEntity } from '../../conversations/infrastructure/persistence/conversation.entity';
import { assertNoActiveExecutions } from '../../executions/domain/execution-lifecycle';
import {
  PROJECT_RESOURCE,
  hasProjectChanges,
  optionalText,
  toProjectDto,
  type OwnerScope,
  type ProjectChanges,
} from '../domain/project';
import { ProjectEntity } from '../infrastructure/persistence/project.entity';
import { assertProjectNamed, assertProjectWritable } from './project-state';

export interface CreateProjectCommand extends ProjectChanges {
  readonly name: string;
}

export interface ProjectListQuery {
  readonly cursor?: string;
  readonly limit?: number;
  /** `true`: pinned projects in pin order; `false`: unpinned only; omitted: every named project. */
  readonly pinned?: boolean;
}

export interface ProjectPage {
  readonly items: readonly Project[];
  readonly nextCursor: string | null;
}

const ROW_LOCK = { lock: { mode: 'pessimistic_write' } } as const;
/** Serializes the pin count and the pin write of one owner inside the current transaction. */
const OWNER_PIN_LOCK = 'SELECT pg_advisory_xact_lock(hashtext($1))';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async create(principal: AuthPrincipal, command: CreateProjectCommand): Promise<Project> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProjectEntity);
      const project = await repository.save(
        repository.create({
          ...scope,
          context: null,
          description: optionalText(command.description) ?? null,
          kind: 'named',
          name: command.name,
          status: 'active',
        }),
      );
      if (command.context !== undefined) {
        const content = normalizeContextContent(
          command.context,
          this.config?.get<number>('CONTEXT_DOCUMENT_MAX_BYTES', 65_536) ?? 65_536,
        );
        await new TypeOrmContextRepository(manager).save(
          { type: 'project', id: project.id },
          'context',
          content,
          0,
        );
        return toProjectDto({ ...project, context: content === '' ? null : content });
      }
      return toProjectDto(project);
    });
  }

  /**
   * Named, active projects of the caller. Pinned projects come back in the order they were pinned;
   * the others most recently updated first. Implicit shells stay hidden.
   */
  async list(principal: AuthPrincipal, query: ProjectListQuery): Promise<ProjectPage> {
    const scope = await this.tenants.scopeFor(principal.id);
    const queryBuilder = this.ownedNamedProjects(
      this.dataSource.getRepository(ProjectEntity),
      scope,
    );
    if (query.pinned === true) {
      const items = await queryBuilder
        .andWhere('project.pinnedAt IS NOT NULL')
        .orderBy('project.pinnedAt', 'ASC')
        .addOrderBy('project.id', 'ASC')
        .take(PROJECT_PIN_LIMIT)
        .getMany();
      return { items: items.map(toProjectDto), nextCursor: null };
    }
    if (query.pinned === false) queryBuilder.andWhere('project.pinnedAt IS NULL');
    const page = await paginateByCursor(queryBuilder, {
      cursor: query.cursor,
      limit: query.limit,
      sortColumn: 'updated_at',
    });
    return { items: page.items.map(toProjectDto), nextCursor: page.nextCursor };
  }

  async get(principal: AuthPrincipal, id: string): Promise<Project> {
    const scope = await this.tenants.scopeFor(principal.id);
    const project = await findOwnedOrThrow(
      this.dataSource.getRepository(ProjectEntity),
      { id, ...scope },
      PROJECT_RESOURCE,
    );
    return toProjectDto(project);
  }

  async update(principal: AuthPrincipal, id: string, changes: ProjectChanges): Promise<Project> {
    if (changes.context !== undefined) {
      throw new ApiException(
        409,
        'context_revision_required',
        'Use the versioned context documents endpoint to update context.',
      );
    }
    if (!hasProjectChanges(changes)) {
      throw new ApiException(400, 'invalid_update', 'At least one field must be provided.');
    }
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProjectEntity);
      const ownership = { id, ...scope };
      const project = await findOwnedOrThrow(repository, ownership, PROJECT_RESOURCE, ROW_LOCK);
      assertProjectWritable(project);
      if (changes.name !== undefined) assertProjectNamed(project);
      await updateOwnedOrThrow(
        repository,
        ownership,
        {
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.description === undefined
            ? {}
            : { description: optionalText(changes.description) }),
        },
        PROJECT_RESOURCE,
      );
      return toProjectDto(await findOwnedOrThrow(repository, ownership, PROJECT_RESOURCE));
    });
  }

  /**
   * Pins or unpins a named project. Repeating the current state changes nothing. The pinned list
   * is served as one page, so pinning beyond `PROJECT_PIN_LIMIT` is refused instead of silently
   * hiding the extra project from the navigation.
   */
  async setPinned(principal: AuthPrincipal, id: string, pinned: boolean): Promise<Project> {
    const scope = await this.tenants.scopeFor(principal.id);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProjectEntity);
      const ownership = { id, ...scope };
      // Taken before the row lock so every pin of one owner sees a consistent count.
      if (pinned) await manager.query(OWNER_PIN_LOCK, [scope.ownerUserId]);
      const project = await findOwnedOrThrow(repository, ownership, PROJECT_RESOURCE, ROW_LOCK);
      assertProjectWritable(project);
      assertProjectNamed(project);
      if ((project.pinnedAt !== null) === pinned) return toProjectDto(project);
      if (pinned) await this.assertPinCapacity(manager, scope);
      await updateOwnedOrThrow(
        repository,
        ownership,
        { pinnedAt: pinned ? () => 'now()' : null },
        PROJECT_RESOURCE,
      );
      return toProjectDto(await findOwnedOrThrow(repository, ownership, PROJECT_RESOURCE));
    });
  }

  /**
   * Lock parent then children before checking executions, matching dispatch and projection.
   * Nonterminal work reserves the project and its chats until its runtime outcome is known.
   */
  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const scope = await this.tenants.scopeFor(principal.id);
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProjectEntity);
      const ownership = { id, ...scope };
      await findOwnedOrThrow(repository, ownership, PROJECT_RESOURCE, ROW_LOCK);
      const conversations = await manager
        .getRepository(ConversationEntity)
        .createQueryBuilder('conversation')
        .where('conversation.projectId = :projectId', { projectId: id })
        .orderBy('conversation.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      await assertNoActiveExecutions(
        manager,
        conversations.map((conversation) => conversation.id),
      );
      await deleteOwnedOrThrow(repository, ownership, PROJECT_RESOURCE);
    });
  }

  private async assertPinCapacity(manager: EntityManager, scope: OwnerScope): Promise<void> {
    const pinnedCount = await manager.getRepository(ProjectEntity).count({
      where: { ...scope, pinnedAt: Not(IsNull()) },
    });
    if (pinnedCount >= PROJECT_PIN_LIMIT) {
      throw new ApiException(
        409,
        'project_pin_limit_reached',
        `At most ${PROJECT_PIN_LIMIT} projects can be pinned.`,
      );
    }
  }

  private ownedNamedProjects(repository: Repository<ProjectEntity>, scope: OwnerScope) {
    return repository
      .createQueryBuilder('project')
      .where('project.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere('project.ownerUserId = :ownerUserId', { ownerUserId: scope.ownerUserId })
      .andWhere('project.kind = :kind', { kind: 'named' })
      .andWhere('project.status = :status', { status: 'active' });
  }
}
