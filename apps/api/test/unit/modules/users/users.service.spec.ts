import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { UserIdentityEntity } from '@api/modules/users/user-identity.entity';
import type { UserEntity } from '@api/modules/users/user.entity';
import { UsersService, type VerifiedIdentity } from '@api/modules/users/users.service';

const identity: VerifiedIdentity = Object.freeze({
  avatarUrl: 'https://example.test/avatar.png',
  displayName: 'Alfred User',
  email: 'person@example.test',
  issuer: 'https://accounts.google.com',
  provider: 'google',
  subject: 'google-subject',
});

function user(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    avatarUrl: null,
    createdAt: new Date(),
    displayName: 'Old Name',
    email: identity.email,
    id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
    identities: [],
    lastLoginAt: null,
    refreshSessions: [],
    role: 'user',
    status: 'active',
    updatedAt: new Date(),
    ...overrides,
  };
}

function linkedIdentity(overrides: Partial<UserIdentityEntity> = {}): UserIdentityEntity {
  const owner = user();
  return {
    createdAt: new Date(),
    emailAtLink: identity.email,
    id: '2fba1a7d-ef8f-4af3-b05f-8c6b5c1fd390',
    issuer: identity.issuer,
    lastAuthenticatedAt: new Date(),
    provider: identity.provider,
    subject: identity.subject,
    user: owner,
    userId: owner.id,
    ...overrides,
  };
}

function dataSourceWith(
  users: Readonly<Record<string, unknown>>,
  identities: Readonly<Record<string, unknown>>,
): DataSource {
  const manager = {
    getRepository: vi.fn((entity: unknown) => (entity === UserIdentityEntity ? identities : users)),
  } as unknown as EntityManager;

  return {
    getRepository: vi.fn((entity: unknown) => (entity === UserIdentityEntity ? identities : users)),
    transaction: vi.fn((work: (transaction: EntityManager) => unknown) =>
      Promise.resolve(work(manager)),
    ),
  } as unknown as DataSource;
}

describe('UsersService', () => {
  it('updates the active user resolved by issuer and subject', async () => {
    const existingIdentity = linkedIdentity();
    const users = {
      create: vi.fn((value: Partial<UserEntity>) => value as UserEntity),
      findOne: vi.fn().mockResolvedValue(existingIdentity.user),
      save: vi.fn((value: UserEntity) => Promise.resolve(value)),
    };
    const identities = {
      findOne: vi.fn().mockResolvedValue(existingIdentity),
      save: vi.fn((value: UserIdentityEntity) => Promise.resolve(value)),
    };
    const service = new UsersService(dataSourceWith(users, identities));

    await expect(service.upsertVerifiedIdentity(identity)).resolves.toMatchObject({
      avatarUrl: identity.avatarUrl,
      displayName: identity.displayName,
    });
    expect(identities.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { issuer: identity.issuer, subject: identity.subject } }),
    );
    expect(identities.save.mock.calls[0]?.[0].lastAuthenticatedAt).toBeInstanceOf(Date);
  });

  it('rejects disabled accounts even when the external identity succeeds', async () => {
    const disabledUser = user({ status: 'disabled' });
    const identities = {
      findOne: vi.fn().mockResolvedValue(linkedIdentity({ userId: disabledUser.id })),
    };
    const service = new UsersService(
      dataSourceWith({ findOne: vi.fn().mockResolvedValue(disabledUser) }, identities),
    );

    await expect(service.upsertVerifiedIdentity(identity)).rejects.toThrow(UnauthorizedException);
  });

  it('does not silently link a new subject to an email owned by another user', async () => {
    const users = { findOne: vi.fn().mockResolvedValue(user()) };
    const identities = { findOne: vi.fn().mockResolvedValue(null) };
    const service = new UsersService(dataSourceWith(users, identities));

    await expect(service.upsertVerifiedIdentity(identity)).rejects.toThrow(ConflictException);
  });

  it('creates the user and identity atomically for a new verified identity', async () => {
    const createdUser = user();
    const users = {
      create: vi.fn((value: Partial<UserEntity>) => ({ ...createdUser, ...value })),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((value: UserEntity) => Promise.resolve(value)),
    };
    const identities = {
      create: vi.fn((value: Partial<UserIdentityEntity>) => value as UserIdentityEntity),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn((value: UserIdentityEntity) => Promise.resolve(value)),
    };
    const source = dataSourceWith(users, identities);
    const transaction = vi.spyOn(source, 'transaction');
    const service = new UsersService(source);

    await expect(service.upsertVerifiedIdentity(identity)).resolves.toMatchObject({
      role: 'user',
      status: 'active',
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(identities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: identity.issuer,
        provider: 'google',
        subject: identity.subject,
        userId: createdUser.id,
      }),
    );
  });

  it('recovers when another transaction creates the same identity first', async () => {
    const concurrentIdentity = linkedIdentity();
    const duplicateKeyError = Object.assign(new Error('duplicate key'), {
      driverError: { code: '23505' },
    });
    const users = {
      create: vi.fn((value: Partial<UserEntity>) => ({ ...user(), ...value })),
      findOne: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(concurrentIdentity.user),
      save: vi
        .fn()
        .mockRejectedValueOnce(duplicateKeyError)
        .mockResolvedValueOnce(concurrentIdentity.user),
    };
    const identities = {
      create: vi.fn((value: Partial<UserIdentityEntity>) => value as UserIdentityEntity),
      findOne: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(concurrentIdentity),
      save: vi.fn((value: UserIdentityEntity) => Promise.resolve(value)),
    };
    const service = new UsersService(dataSourceWith(users, identities));

    await expect(service.upsertVerifiedIdentity(identity)).resolves.toMatchObject({
      id: concurrentIdentity.user.id,
    });
  });

  it('resolves only active users for authenticated requests', async () => {
    const users = { findOne: vi.fn().mockResolvedValueOnce(user()).mockResolvedValueOnce(null) };
    const service = new UsersService(dataSourceWith(users, {}));

    await expect(service.findActiveById(user().id)).resolves.toMatchObject({ id: user().id });
    await expect(service.findActiveById('missing')).rejects.toThrow(UnauthorizedException);
  });
});
