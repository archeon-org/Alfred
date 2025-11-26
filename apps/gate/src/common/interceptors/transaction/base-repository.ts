import { Request } from 'express';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ENTITY_MANAGER_KEY } from './transaction.interceptor';

export class BaseRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly request: Request,
  ) {}

  protected getRepository<T>(entityCls: new () => T): Repository<T> {
    const entityManager: EntityManager =
      this.request[ENTITY_MANAGER_KEY] ?? this.dataSource.manager;
    return entityManager.getRepository(entityCls);
  }
}
