import { NotFoundException } from '@nestjs/common';
import { ProcessingStatus } from '@archeon-org/database';
import { CategoryService } from 'src/category/category.service';

const paginateMock = jest.fn();

jest.mock('nestjs-paginate', () => ({
  paginate: (...args: any[]) => paginateMock(...args),
}));

describe('CategoryService', () => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    loadRelationCountAndMap: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const categoryRepository = {
    create: jest.fn((data) => data),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const documentRepository = {
    update: jest.fn(),
  };

  const service = new CategoryService(
    categoryRepository as any,
    documentRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    paginateMock.mockReset();
  });

  it('creates custom category with non-system flag', async () => {
    categoryRepository.save.mockResolvedValue({ id: 'cat-1' });

    await service.createCustom({ name: 'Custom' } as any, 'user-1');

    expect(categoryRepository.create).toHaveBeenCalledWith({
      name: 'Custom',
      userId: 'user-1',
      isSystemDefault: false,
      order: 0,
    });
    expect(categoryRepository.save).toHaveBeenCalled();
  });

  it('creates system categories in bulk', async () => {
    categoryRepository.save.mockResolvedValue([
      { id: 'cat-1' },
      { id: 'cat-2' },
    ]);

    await service.createManySystem(
      [{ name: 'One' }, { name: 'Two' }] as any,
      'user-1',
    );

    expect(categoryRepository.create).toHaveBeenCalledTimes(2);
    expect(categoryRepository.create).toHaveBeenNthCalledWith(1, {
      name: 'One',
      userId: 'user-1',
      isSystemDefault: true,
      order: 0,
    });
    expect(categoryRepository.create).toHaveBeenNthCalledWith(2, {
      name: 'Two',
      userId: 'user-1',
      isSystemDefault: true,
      order: 0,
    });
  });

  it('paginates categories and applies hide-empty filter', async () => {
    paginateMock.mockResolvedValue({ data: [] });

    await service.findAll('user-1', { page: 1 } as any, true);

    expect(categoryRepository.createQueryBuilder).toHaveBeenCalledWith(
      'category',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalled();
    expect(paginateMock).toHaveBeenCalled();
  });

  it('aggregates child document counts into parent in tree mode', async () => {
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'parent-1',
        name: 'Parent',
        userId: 'user-1',
        parentId: null,
        order: 0,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        documentCount: 0,
      },
      {
        id: 'child-1',
        name: 'Child',
        userId: 'user-1',
        parentId: 'parent-1',
        order: 0,
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
        documentCount: 1,
      },
    ]);

    const tree = await service.findTree('user-1', false);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('parent-1');
    expect(tree[0].documentCount).toBe(1);
    expect(tree[0].children?.[0].id).toBe('child-1');
    expect((tree[0].children?.[0] as any).documentCount).toBe(1);
  });

  it('throws when category is not found', async () => {
    categoryRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('cat-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates an existing category', async () => {
    categoryRepository.findOne.mockResolvedValue({ id: 'cat-1', name: 'Old' });
    categoryRepository.save.mockResolvedValue({ id: 'cat-1', name: 'New' });

    await service.update('cat-1', { name: 'New' } as any, 'user-1');

    expect(categoryRepository.save).toHaveBeenCalledWith({
      id: 'cat-1',
      name: 'New',
    });
  });

  it('removes category and sets related documents to pending', async () => {
    categoryRepository.findOne.mockResolvedValue({ id: 'cat-1' });
    categoryRepository.remove.mockResolvedValue(undefined);

    await service.remove('cat-1', 'user-1');

    expect(documentRepository.update).toHaveBeenCalledWith(
      { categoryId: 'cat-1', userId: 'user-1' },
      { processingStatus: ProcessingStatus.PENDING },
    );
    expect(categoryRepository.remove).toHaveBeenCalledWith({ id: 'cat-1' });
  });
});
