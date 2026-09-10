import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, type EntityManager, type Repository } from 'typeorm';
import { WorkspaceMembershipEntity } from '../workspaces/infrastructure/workspace-membership.entity';
import { WorkspacesService } from '../workspaces/application/workspaces.service';
import { TenantsService } from '../tenants/tenants.service';
import { UserEntity } from './user.entity';
import { UserIdentityEntity } from './user-identity.entity';

export interface VerifiedIdentity {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly issuer: string;
  readonly provider: string;
  readonly subject: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenants: TenantsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async upsertVerifiedIdentity(identity: VerifiedIdentity): Promise<UserEntity> {
    try {
      return await this.dataSource.transaction((manager) => this.upsert(manager, identity));
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;

      try {
        return await this.dataSource.transaction((manager) =>
          this.updateConcurrentIdentity(manager, identity),
        );
      } catch (retryError: unknown) {
        if (retryError instanceof UnauthorizedException) throw retryError;
        throw this.identityConflict();
      }
    }
  }

  async findActiveById(id: string): Promise<UserEntity> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id, status: 'active' } });
    if (user === null) throw new UnauthorizedException('Account is unavailable');
    return user;
  }

  private async upsert(manager: EntityManager, identity: VerifiedIdentity): Promise<UserEntity> {
    const identities = manager.getRepository(UserIdentityEntity);
    const users = manager.getRepository(UserEntity);
    const existingIdentity = await identities.findOne({
      lock: { mode: 'pessimistic_write' },
      where: { issuer: identity.issuer, subject: identity.subject },
    });

    if (existingIdentity !== null) {
      const existingUser = await users.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id: existingIdentity.userId },
      });
      if (existingUser === null) throw this.identityConflict();
      return this.updateExisting(users, identities, existingUser, existingIdentity, identity);
    }

    const emailOwner = await users.findOne({ where: { email: identity.email } });
    if (emailOwner !== null) throw this.identityConflict();

    const tenantId = await this.tenants.defaultTenantId(manager);
    const workspaceId = await this.workspaces.defaultWorkspaceId(manager, tenantId);
    const now = new Date();
    const user = await users.save(
      users.create({
        avatarUrl: identity.avatarUrl,
        displayName: identity.displayName,
        email: identity.email,
        lastLoginAt: now,
        role: 'user',
        status: 'active',
        tenantId,
      }),
    );
    await manager
      .getRepository(WorkspaceMembershipEntity)
      .insert({ tenantId, userId: user.id, workspaceId });
    await identities.save(
      identities.create({
        emailAtLink: identity.email,
        issuer: identity.issuer,
        lastAuthenticatedAt: now,
        provider: identity.provider,
        subject: identity.subject,
        userId: user.id,
      }),
    );
    return user;
  }

  private async updateConcurrentIdentity(
    manager: EntityManager,
    identity: VerifiedIdentity,
  ): Promise<UserEntity> {
    const identities = manager.getRepository(UserIdentityEntity);
    const users = manager.getRepository(UserEntity);
    const existingIdentity = await identities.findOne({
      lock: { mode: 'pessimistic_write' },
      where: { issuer: identity.issuer, subject: identity.subject },
    });
    if (existingIdentity === null) throw this.identityConflict();

    const existingUser = await users.findOne({
      lock: { mode: 'pessimistic_write' },
      where: { id: existingIdentity.userId },
    });
    if (existingUser === null) throw this.identityConflict();
    return this.updateExisting(users, identities, existingUser, existingIdentity, identity);
  }

  private async updateExisting(
    users: Repository<UserEntity>,
    identities: Repository<UserIdentityEntity>,
    existingUser: UserEntity,
    existingIdentity: UserIdentityEntity,
    identity: VerifiedIdentity,
  ): Promise<UserEntity> {
    if (existingUser.status !== 'active') {
      throw new UnauthorizedException('Account is disabled');
    }

    const now = new Date();
    const updatedUser = await users.save(
      users.create({
        ...existingUser,
        avatarUrl: identity.avatarUrl,
        displayName: identity.displayName,
        email: identity.email,
        lastLoginAt: now,
      }),
    );
    await identities.save({ ...existingIdentity, lastAuthenticatedAt: now });
    return updatedUser;
  }

  private identityConflict(): ConflictException {
    return new ConflictException('The verified identity is already linked to another account');
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;

    const driverError: unknown = (error as { readonly driverError?: unknown }).driverError;
    if (typeof driverError !== 'object' || driverError === null) return false;

    return (driverError as { readonly code?: unknown }).code === '23505';
  }
}
