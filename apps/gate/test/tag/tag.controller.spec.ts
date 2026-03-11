import { TagController } from 'src/tag/tag.controller';

describe('TagController', () => {
  const tagService = {
    findAll: jest.fn(),
    findByName: jest.fn(),
    createCustom: jest.fn(),
  };
  const controller = new TagController(tagService as any);
  const req = { user: { id: 'user-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists tags for current user', async () => {
    tagService.findAll.mockResolvedValue([{ id: 'tag-1' }]);

    await controller.findAll(req as any);

    expect(tagService.findAll).toHaveBeenCalledWith('user-1');
  });

  it('returns existing tag when name already exists', async () => {
    const dto = { name: 'Invoices' };
    tagService.findByName.mockResolvedValue({ id: 'tag-1', ...dto });

    const result = await controller.create(req as any, dto as any);

    expect(tagService.findByName).toHaveBeenCalledWith('Invoices', 'user-1');
    expect(tagService.createCustom).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'tag-1', name: 'Invoices' });
  });

  it('creates custom tag when not found', async () => {
    const dto = { name: 'Receipts' };
    tagService.findByName.mockResolvedValue(null);
    tagService.createCustom.mockResolvedValue({ id: 'tag-2', ...dto });

    await controller.create(req as any, dto as any);

    expect(tagService.createCustom).toHaveBeenCalledWith(dto, 'user-1');
  });
});
