import { DocumentRepository } from 'src/document/document.repository';

describe('DocumentRepository', () => {
  const findByIdsQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const updateManyQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn((alias?: string) =>
      alias ? findByIdsQueryBuilder : updateManyQueryBuilder,
    ),
  };

  const dataSource = {
    manager: {
      getRepository: jest.fn(() => repo),
    },
  } as any;

  const repository = new DocumentRepository(dataSource, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    findByIdsQueryBuilder.getMany.mockResolvedValue([]);
    updateManyQueryBuilder.execute.mockResolvedValue(undefined);
  });

  it('creates and saves a document', async () => {
    repo.create.mockImplementation((data) => ({ id: 'doc-1', ...data }));
    repo.save.mockImplementation(async (entity) => entity);

    const result = await repository.create({
      userId: 'user-1',
      title: 'Doc',
    } as any);

    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'Doc',
    });
    expect(repo.save).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'doc-1' }));
  });

  it('findById requests category and tags relations', async () => {
    await repository.findById('doc-1');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      relations: ['category', 'tags'],
    });
  });

  it('findByIds uses IN query builder clause', async () => {
    await repository.findByIds(['doc-1', 'doc-2']);

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('document');
    expect(findByIdsQueryBuilder.where).toHaveBeenCalledWith(
      'document.id IN (:...ids)',
      { ids: ['doc-1', 'doc-2'] },
    );
    expect(findByIdsQueryBuilder.getMany).toHaveBeenCalled();
  });

  it('findByUserId orders by most recent', async () => {
    await repository.findByUserId('user-1');

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('update writes scalar fields and tag relation updates', async () => {
    repo.update.mockResolvedValue(undefined);
    repo.save.mockResolvedValue(undefined);
    const findByIdSpy = jest
      .spyOn(repository, 'findById')
      .mockResolvedValueOnce({ id: 'doc-1', tags: [] } as any)
      .mockResolvedValueOnce({ id: 'doc-1', tags: [{ id: 'tag-1' }] } as any);

    const result = await repository.update('doc-1', {
      title: 'Updated',
      tagIds: ['tag-1', 'tag-2'],
    } as any);

    expect(repo.update).toHaveBeenCalledWith('doc-1', { title: 'Updated' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [{ id: 'tag-1' }, { id: 'tag-2' }],
      }),
    );
    expect(findByIdSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: 'doc-1', tags: [{ id: 'tag-1' }] });
  });

  it('update skips scalar update when only tagIds are provided', async () => {
    repo.save.mockResolvedValue(undefined);
    jest
      .spyOn(repository, 'findById')
      .mockResolvedValueOnce({ id: 'doc-1', tags: [] } as any)
      .mockResolvedValueOnce({ id: 'doc-1', tags: [] } as any);

    await repository.update('doc-1', { tagIds: ['tag-1'] } as any);

    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('update does not save tags when the document is missing', async () => {
    jest
      .spyOn(repository, 'findById')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await repository.update('missing-doc', { tagIds: ['tag-1'] } as any);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updateMany performs bulk update query', async () => {
    await repository.updateMany(['doc-1', 'doc-2'], { title: 'Bulk' } as any);

    expect(updateManyQueryBuilder.update).toHaveBeenCalled();
    expect(updateManyQueryBuilder.set).toHaveBeenCalledWith({ title: 'Bulk' });
    expect(updateManyQueryBuilder.where).toHaveBeenCalledWith(
      'id IN (:...ids)',
      { ids: ['doc-1', 'doc-2'] },
    );
    expect(updateManyQueryBuilder.execute).toHaveBeenCalled();
  });

  it('softDelete delegates to repository softDelete', async () => {
    await repository.softDelete('doc-1');

    expect(repo.softDelete).toHaveBeenCalledWith('doc-1');
  });
});
