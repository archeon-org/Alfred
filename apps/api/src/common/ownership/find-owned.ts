import type { FindOneOptions, FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ApiException } from '../errors/api.exception';
import { OwnedResourceNotFoundException } from './owned-resource-not-found.exception';

export interface OwnedResource extends ObjectLiteral {
  readonly id: string;
  readonly ownerUserId: string;
}

export type Ownership = Readonly<Pick<OwnedResource, 'id' | 'ownerUserId'>>;

// Every read/write MUST include owner_user_id in the SQL WHERE, including UPDATE and DELETE.
// Never load by id then compare owners; require exactly one affected row for a mutation.
// Validate UUIDs at the HTTP boundary. resourceName is a developer-owned constant.
function ownedWhere<T extends OwnedResource>(
  ownership: Ownership,
  resourceName: string,
): FindOptionsWhere<T> {
  if (
    typeof ownership.id !== 'string' ||
    ownership.id.trim().length === 0 ||
    typeof ownership.ownerUserId !== 'string' ||
    ownership.ownerUserId.trim().length === 0
  ) {
    throw new OwnedResourceNotFoundException(resourceName);
  }
  return { id: ownership.id, ownerUserId: ownership.ownerUserId } as FindOptionsWhere<T>;
}

export async function findOwnedOrThrow<T extends OwnedResource>(
  repository: { findOne(options: FindOneOptions<T>): Promise<T | null> },
  ownership: Ownership,
  resourceName: string,
): Promise<T> {
  const resource = await repository.findOne({ where: ownedWhere<T>(ownership, resourceName) });
  if (resource === null) throw new OwnedResourceNotFoundException(resourceName);
  return resource;
}

export async function updateOwnedOrThrow<T extends OwnedResource>(
  repository: Pick<Repository<T>, 'update'>,
  ownership: Ownership,
  changes: QueryDeepPartialEntity<Omit<T, 'id' | 'ownerUserId'>>,
  resourceName: string,
): Promise<void> {
  if (
    Object.hasOwn(changes, 'id') ||
    Object.hasOwn(changes, 'ownerUserId') ||
    Object.hasOwn(changes, 'owner_user_id')
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
