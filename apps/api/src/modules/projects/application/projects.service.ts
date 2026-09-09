import type { Project } from '@alfred/contracts';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { ApiException } from '../../../common/errors/api.exception';
import {
  deleteOwnedOrThrow,
  findOwnedOrThrow,
  updateOwnedOrThrow,
} from '../../../common/ownership/find-owned';
import { paginateByCursor } from '../../../common/pagination/paginate';
import { TenantsService } from '../../tenants/tenants.service';
import {
  PROJECT_RESOURCE,
  hasProjectChanges,
  optionalText,
  toProjectDto,
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
}

export interface ProjectPage {
  readonly items: readonly Project[];
  readonly nextCursor: string | null;
}

const ROW_LOCK = { lock: { mode: 'pessimistic_write' } } as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantsService,
  ) {}

  async create(principal: AuthPrincipal, command: CreateProjectCommand): Promise<Project> {
    const scope = await this.tenants.scopeFor(principal.id);
    const repository = this.dataSource.getRepository(ProjectEntity);
    const project = await repository.save(
      repository.create({
        ...scope,
        context: optionalText(command.context) ?? null,
        description: optionalText(command.description) ?? null,
        kind: 'named',
        name: command.name,
        status: 'active',
      }),
    );
    return toProjectDto(project);
  }

  /** Named, active projects of the caller, most recently updated first. Implicit shells stay hidden. */
  async list(principal: AuthPrincipal, query: ProjectListQuery): Promise<ProjectPage> {
    const scope = await this.tenants.scopeFor(principal.id);
    const queryBuilder = this.dataSource
      .getRepository(ProjectEntity)
      .createQueryBuilder('project')
      .where('project.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere('project.ownerUserId = :ownerUserId', { ownerUserId: scope.ownerUserId })
      .andWhere('project.kind = :kind', { kind: 'named' })
      .andWhere('project.status = :status', { status: 'active' });
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
          ...(changes.context === undefined ? {} : { context: optionalText(changes.context) }),
        },
        PROJECT_RESOURCE,
      );
      return toProjectDto(await findOwnedOrThrow(repository, ownership, PROJECT_RESOURCE));
    });
  }

  /**
   * Immediate transactional deletion (story PRJ-06 option C1): no artifact, runtime binding or
   * Execution exists yet, so the row lock plus SQL cascade removes the project and its chats
   * atomically. Asynchronous cleanup with receipts (C2) arrives with artifacts.
   */
  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const scope = await this.tenants.scopeFor(principal.id);
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProjectEntity);
      const ownership = { id, ...scope };
      await findOwnedOrThrow(repository, ownership, PROJECT_RESOURCE, ROW_LOCK);
      await deleteOwnedOrThrow(repository, ownership, PROJECT_RESOURCE);
    });
  }
}
