import { TemplateRepository } from 'src/template/template.repository';

describe('TemplateRepository', () => {
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const dataSource = {
    manager: {
      getRepository: jest.fn(() => repo),
    },
  } as any;

  const repository = new TemplateRepository(dataSource, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and saves a template', async () => {
    repo.create.mockImplementation((data) => ({ id: 'tpl-1', ...data }));
    repo.save.mockImplementation(async (entity) => entity);

    const result = await repository.create({ name: 'Starter' } as any);

    expect(repo.create).toHaveBeenCalledWith({ name: 'Starter' });
    expect(repo.save).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'tpl-1' }));
  });

  it('findAll loads categories and tags relations', async () => {
    await repository.findAll();

    expect(repo.find).toHaveBeenCalledWith({
      relations: ['categories', 'tags'],
    });
  });

  it('findById loads categories and tags relations', async () => {
    await repository.findById('tpl-1');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      relations: ['categories', 'tags'],
    });
  });

  it('update persists changes then returns refreshed template', async () => {
    repo.update.mockResolvedValue(undefined);
    const refreshed = { id: 'tpl-1', name: 'Updated' } as any;
    const findByIdSpy = jest
      .spyOn(repository, 'findById')
      .mockResolvedValue(refreshed);

    const result = await repository.update('tpl-1', { name: 'Updated' } as any);

    expect(repo.update).toHaveBeenCalledWith('tpl-1', { name: 'Updated' });
    expect(findByIdSpy).toHaveBeenCalledWith('tpl-1');
    expect(result).toBe(refreshed);
  });

  it('delete delegates to repository delete', async () => {
    await repository.delete('tpl-1');

    expect(repo.delete).toHaveBeenCalledWith('tpl-1');
  });
});
