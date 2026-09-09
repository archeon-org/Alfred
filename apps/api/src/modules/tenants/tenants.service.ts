import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { OwnerScope } from '../../common/ownership/owner-scope';
import { UserEntity } from '../users/user.entity';
import { TenantEntity } from './tenant.entity';

/** The bootstrap tenant created by the `CreateTenants` migration; V1 exposes no tenant administration. */
export const DEFAULT_TENANT_SLUG = 'default';

@Injectable()
export class TenantsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Tenant assigned to newly created accounts. Missing bootstrap data is a deployment error. */
  async defaultTenantId(manager: EntityManager = this.dataSource.manager): Promise<string> {
    const tenant = await manager.getRepository(TenantEntity).findOne({
      select: { id: true },
      where: { slug: DEFAULT_TENANT_SLUG, status: 'active' },
    });
    if (tenant === null) throw new Error('The default tenant has not been bootstrapped');
    return tenant.id;
  }

  /** Resolve the tenant-rooted ownership scope of an authenticated user from trusted product state. */
  async scopeFor(userId: string): Promise<OwnerScope> {
    const user = await this.dataSource.getRepository(UserEntity).findOne({
      select: { id: true, tenantId: true },
      where: { id: userId, status: 'active' },
    });
    if (user === null) throw new UnauthorizedException('Account is unavailable');
    return Object.freeze({ ownerUserId: user.id, tenantId: user.tenantId });
  }
}
