import type { CurrentWorkspaces } from '@alfred/contracts';
import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { TenantEntity } from '../../tenants/tenant.entity';
import { UserEntity } from '../../users/user.entity';
import { WorkspaceEntity } from '../infrastructure/workspace.entity';
import { DEFAULT_WORKSPACE_SLUG } from './workspace.constants';

@Injectable()
export class WorkspacesService {
  constructor(private readonly dataSource: DataSource) {}

  async defaultWorkspaceId(manager: EntityManager, tenantId: string): Promise<string> {
    // Match provisioning lock order: tenant, workspace, then user.
    const tenant = await manager.getRepository(TenantEntity).findOne({
      lock: { mode: 'pessimistic_read' },
      select: { id: true },
      where: { id: tenantId, status: 'active' },
    });
    if (tenant === null) throw new Error('The default tenant has not been bootstrapped');
    const workspace = await manager.getRepository(WorkspaceEntity).findOne({
      lock: { mode: 'pessimistic_read' },
      select: { id: true },
      where: { tenantId, slug: DEFAULT_WORKSPACE_SLUG, status: 'active' },
    });
    if (workspace === null) throw new Error('The default workspace has not been bootstrapped');
    return workspace.id;
  }

  async currentFor(userId: string): Promise<CurrentWorkspaces> {
    const user = await this.dataSource.getRepository(UserEntity).findOne({
      relations: { tenant: true, workspaceMemberships: { workspace: true } },
      where: {
        id: userId,
        status: 'active',
      },
    });
    if (user === null) throw new UnauthorizedException('Account is unavailable');
    if (
      user.workspaceMemberships?.some(
        (membership) =>
          membership.tenantId !== user.tenantId || membership.workspace.tenantId !== user.tenantId,
      )
    ) {
      throw new InternalServerErrorException();
    }
    return {
      tenant: { id: user.tenant.id, name: user.tenant.name },
      workspaces: (user.workspaceMemberships ?? [])
        .filter((membership) => membership.workspace.status === 'active')
        .map(({ workspace }) => ({ id: workspace.id, name: workspace.name }))
        .toSorted((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id)),
    };
  }
}
