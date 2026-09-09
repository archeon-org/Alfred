import { UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { TenantEntity } from '@api/modules/tenants/tenant.entity';
import { DEFAULT_TENANT_SLUG, TenantsService } from '@api/modules/tenants/tenants.service';

function dataSourceWith(tenants: unknown, users: unknown): DataSource {
  const getRepository = vi.fn((entity: unknown) => (entity === TenantEntity ? tenants : users));
  return { getRepository, manager: { getRepository } } as unknown as DataSource;
}

describe('TenantsService', () => {
  it('resolves the bootstrap tenant through the caller transaction manager', async () => {
    const tenants = { findOne: vi.fn().mockResolvedValue({ id: 'tenant-1' }) };
    const manager = { getRepository: vi.fn().mockReturnValue(tenants) } as unknown as EntityManager;
    const service = new TenantsService(dataSourceWith({}, {}));

    await expect(service.defaultTenantId(manager)).resolves.toBe('tenant-1');
    expect(tenants.findOne).toHaveBeenCalledWith({
      select: { id: true },
      where: { slug: DEFAULT_TENANT_SLUG, status: 'active' },
    });
  });

  it('uses the data source manager by default and fails closed without a bootstrap tenant', async () => {
    const tenants = { findOne: vi.fn().mockResolvedValue(null) };
    const service = new TenantsService(dataSourceWith(tenants, {}));

    await expect(service.defaultTenantId()).rejects.toThrow(/bootstrapped/u);
  });

  it('derives the ownership scope from the active user row, never from the request', async () => {
    const users = {
      findOne: vi.fn().mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' }),
    };
    const service = new TenantsService(dataSourceWith({}, users));

    await expect(service.scopeFor('user-1')).resolves.toEqual({
      ownerUserId: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(users.findOne).toHaveBeenCalledWith({
      select: { id: true, tenantId: true },
      where: { id: 'user-1', status: 'active' },
    });
  });

  it('rejects disabled or unknown users', async () => {
    const users = { findOne: vi.fn().mockResolvedValue(null) };
    const service = new TenantsService(dataSourceWith({}, users));

    await expect(service.scopeFor('user-1')).rejects.toThrow(UnauthorizedException);
  });
});
