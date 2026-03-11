import { NotFoundException } from '@nestjs/common';
import { TemplateService } from 'src/template/template.service';

const paginateMock = jest.fn();

jest.mock('nestjs-paginate', () => ({
  paginate: (...args: any[]) => paginateMock(...args),
}));

describe('TemplateService', () => {
  const templateRepo = {};
  const templateCategoryRepo = {};
  const templateRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const categoryService = {
    createSystem: jest.fn(),
  };
  const tagService = {
    createManySystem: jest.fn(),
  };
  const userService = {
    update: jest.fn(),
  };

  const service = new TemplateService(
    templateRepo as any,
    templateCategoryRepo as any,
    templateRepository as any,
    categoryService as any,
    tagService as any,
    userService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    paginateMock.mockReset();
  });

  it('creates template through repository', async () => {
    templateRepository.create.mockResolvedValue({ id: 'tpl-1' });

    await service.create({ name: 'Template' } as any);

    expect(templateRepository.create).toHaveBeenCalledWith({
      name: 'Template',
    });
  });

  it('paginates templates', async () => {
    paginateMock.mockResolvedValue({ data: [] });
    const query = { page: 1 };

    await service.findAll(query as any);

    expect(paginateMock).toHaveBeenCalledWith(query, templateRepo, {
      sortableColumns: ['id', 'name', 'order'],
      nullSort: 'last',
      defaultSortBy: [['order', 'ASC']],
      searchableColumns: ['name', 'description'],
      select: ['id', 'name', 'description', 'icon', 'order'],
      relations: ['categories', 'tags'],
    });
  });

  it('throws when template is missing', async () => {
    templateRepository.findById.mockResolvedValue(null);

    await expect(service.findOne('tpl-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates existing template', async () => {
    templateRepository.findById.mockResolvedValue({ id: 'tpl-1' });
    templateRepository.update.mockResolvedValue({
      id: 'tpl-1',
      name: 'Updated',
    });

    await service.update('tpl-1', { name: 'Updated' } as any);

    expect(templateRepository.update).toHaveBeenCalledWith('tpl-1', {
      name: 'Updated',
    });
  });

  it('removes template after existence check', async () => {
    templateRepository.findById.mockResolvedValue({ id: 'tpl-1' });
    templateRepository.delete.mockResolvedValue(undefined);

    await service.remove('tpl-1');

    expect(templateRepository.delete).toHaveBeenCalledWith('tpl-1');
  });

  it('applies template resources and marks user as onboarded', async () => {
    templateRepository.findById.mockResolvedValue({
      id: 'tpl-1',
      categories: [
        {
          id: 'tpl-cat-1',
          name: 'Cat',
          icon: 'i',
          color: '#111',
          order: 1,
          level: 1,
          parentTemplateCategoryId: null,
        },
      ],
      tags: [{ name: 'Tag', color: '#222' }],
    });
    categoryService.createSystem.mockResolvedValue({ id: 'user-cat-1' });
    tagService.createManySystem.mockResolvedValue([]);
    userService.update.mockResolvedValue({});

    await service.applyTemplate('tpl-1', 'user-1');

    expect(categoryService.createSystem).toHaveBeenCalledWith(
      {
        name: 'Cat',
        icon: 'i',
        color: '#111',
        order: 1,
        parentId: undefined,
      },
      'user-1',
    );
    expect(tagService.createManySystem).toHaveBeenCalledWith(
      [{ name: 'Tag', color: '#222', order: 0 }],
      'user-1',
    );
    expect(userService.update).toHaveBeenCalledWith('user-1', {
      isOnboarded: true,
    });
  });

  it('paginates template categories', async () => {
    paginateMock.mockResolvedValue({ data: [] });
    await service.findCategories('tpl-1', { page: 1 } as any);

    expect(paginateMock).toHaveBeenCalledWith(
      { page: 1 },
      templateCategoryRepo,
      {
        where: { template: { id: 'tpl-1' } },
        sortableColumns: ['level', 'order', 'name'],
        defaultSortBy: [
          ['level', 'ASC'],
          ['order', 'ASC'],
        ],
        searchableColumns: ['name'],
      },
    );
  });
});
