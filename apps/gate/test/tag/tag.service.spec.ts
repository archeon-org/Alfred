import { TagService } from 'src/tag/tag.service';

describe('TagService', () => {
  const tagRepository = {
    create: jest.fn((data) => data),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const service = new TagService(tagRepository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates custom tag', async () => {
    tagRepository.save.mockResolvedValue({ id: 'tag-1' });

    await service.createCustom({ name: 'Custom' } as any, 'user-1');

    expect(tagRepository.create).toHaveBeenCalledWith({
      name: 'Custom',
      userId: 'user-1',
      isSystemDefault: false,
    });
    expect(tagRepository.save).toHaveBeenCalled();
  });

  it('creates many system tags', async () => {
    tagRepository.save.mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]);

    await service.createManySystem(
      [{ name: 'A' }, { name: 'B' }] as any,
      'user-1',
    );

    expect(tagRepository.create).toHaveBeenCalledTimes(2);
    expect(tagRepository.save).toHaveBeenCalled();
  });

  it('finds tags for a user ordered by name', async () => {
    tagRepository.find.mockResolvedValue([]);

    await service.findAll('user-1');

    expect(tagRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { name: 'ASC' },
    });
  });

  it('finds tag by name and user', async () => {
    tagRepository.findOne.mockResolvedValue(null);

    await service.findByName('Invoices', 'user-1');

    expect(tagRepository.findOne).toHaveBeenCalledWith({
      where: { name: 'Invoices', userId: 'user-1' },
    });
  });
});
