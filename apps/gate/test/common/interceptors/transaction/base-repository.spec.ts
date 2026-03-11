import { DataSource } from 'typeorm';
import { BaseRepository } from 'src/common/interceptors/transaction/base-repository';
import { ENTITY_MANAGER_KEY } from 'src/common/interceptors/transaction/transaction.interceptor';

class DummyEntity {}

class TestRepository extends BaseRepository {
  public exposeRepository<T>(entity: new () => T) {
    return this.getRepository(entity);
  }
}

describe('BaseRepository', () => {
  it('uses request-scoped entity manager when available', () => {
    const requestManager = {
      getRepository: jest.fn().mockReturnValue('req-repo'),
    };
    const dataSource = {
      manager: { getRepository: jest.fn().mockReturnValue('ds-repo') },
    } as unknown as DataSource;
    const request = { [ENTITY_MANAGER_KEY]: requestManager } as any;

    const repository = new TestRepository(dataSource, request);
    const result = repository.exposeRepository(DummyEntity);

    expect(result).toBe('req-repo');
    expect(requestManager.getRepository).toHaveBeenCalledWith(DummyEntity);
    expect(dataSource.manager.getRepository).not.toHaveBeenCalled();
  });

  it('falls back to data source manager when request manager is missing', () => {
    const dataSource = {
      manager: { getRepository: jest.fn().mockReturnValue('ds-repo') },
    } as unknown as DataSource;
    const request = {} as any;

    const repository = new TestRepository(dataSource, request);
    const result = repository.exposeRepository(DummyEntity);

    expect(result).toBe('ds-repo');
    expect(dataSource.manager.getRepository).toHaveBeenCalledWith(DummyEntity);
  });
});
