import type { FindOneOptions, FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ApiException } from '../errors/api.exception';
import { OwnedResourceNotFoundException } from './owned-resource-not-found.exception';

export interface OwnedResource extends ObjectLiteral {
  readonly id: string;
  readonly ownerUserId: string;
  readonly tenantId?: string;
}

/** Tenant-rooted resources (ALF-DEC-055) pass `tenantId` so isolation is part of the same predicate. */
export type Ownership = Readonly<{
  readonly id: string;
  readonly ownerUserId: string;
  readonly tenantId?: string;
}>;

export type FindOwnedOptions<T extends ObjectLiteral> = Pick<FindOneOptions<T>, 'lock'>;

function isPresent(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Every read/write MUST include owner_user_id in the SQL WHERE, including UPDATE and DELETE.
// Never load by id then compare owners; require exactly one affected row for a mutation.
// Validate UUIDs at the HTTP boundary. resourceName is a developer-owned constant.
function ownedWhere<T extends OwnedResource>(
  ownership: Ownership,
  resourceName: string,
): FindOptionsWhere<T> {
  if (
    !isPresent(ownership.id) ||
    !isPresent(ownership.ownerUserId) ||
    (ownership.tenantId !== undefined && !isPresent(ownership.tenantId))
  ) {
    throw new OwnedResourceNotFoundException(resourceName);
  }
  return {
    id: ownership.id,
    ownerUserId: ownership.ownerUserId,
    ...(ownership.tenantId === undefined ? {} : { tenantId: ownership.tenantId }),
  } as FindOptionsWhere<T>;
}

export async function findOwnedOrThrow<T extends OwnedResource>(
  repository: { findOne(options: FindOneOptions<T>): Promise<T | null> },
  ownership: Ownership,
  resourceName: string,
  options: FindOwnedOptions<T> = {},
): Promise<T> {
  const resource = await repository.findOne({
    ...options,
    where: ownedWhere<T>(ownership, resourceName),
  });
  if (resource === null) throw new OwnedResourceNotFoundException(resourceName);
  return resource;
}

export async function updateOwnedOrThrow<T extends OwnedResource>(
  repository: Pick<Repository<T>, 'update'>,
  ownership: Ownership,
  changes: QueryDeepPartialEntity<Omit<T, 'id' | 'ownerUserId' | 'tenantId'>>,
  resourceName: string,
): Promise<void> {
  if (
    ['id', 'ownerUserId', 'owner_user_id', 'tenantId', 'tenant_id'].some((field) =>
      Object.hasOwn(changes, field),
    )
  ) {
    throw new ApiException(400, 'invalid_update', 'Ownership and identity cannot be changed.');
  }
  const result = await repository.update(
    ownedWhere<T>(ownership, resourceName),
    changes as QueryDeepPartialEntity<T>,
  );
  if (result.affected !== 1) throw new OwnedResourceNotFoundException(resourceName);
}

export async function deleteOwnedOrThrow<T extends OwnedResource>(
  repository: Pick<Repository<T>, 'delete'>,
  ownership: Ownership,
  resourceName: string,
): Promise<void> {
  const result = await repository.delete(ownedWhere<T>(ownership, resourceName));
  if (result.affected !== 1) throw new OwnedResourceNotFoundException(resourceName);
}
