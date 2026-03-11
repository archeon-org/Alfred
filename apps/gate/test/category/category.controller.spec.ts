import { CategoryController } from 'src/category/category.controller';

describe('CategoryController', () => {
  const categoryService = {
    createCustom: jest.fn(),
    findAll: jest.fn(),
    findTree: jest.fn(),
    findSubfolders: jest.fn(),
    createSubfolder: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const controller = new CategoryController(categoryService as any);
  const user = { id: 'user-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates category for current user', async () => {
    const dto = { name: 'Invoices' };
    categoryService.createCustom.mockResolvedValue({ id: 'cat-1', ...dto });

    await controller.create(dto as any, user as any);

    expect(categoryService.createCustom).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('finds categories and parses hideEmpty query param', async () => {
    const query = { page: 1, limit: 10 };

    await controller.findAll(user as any, query as any, 'true');

    expect(categoryService.findAll).toHaveBeenCalledWith('user-1', query, true);
  });

  it('finds category tree and parses hideEmpty query param', async () => {
    await controller.findTree(user as any, 'true');

    expect(categoryService.findTree).toHaveBeenCalledWith('user-1', true);
  });

  it('finds subfolders and parses hideEmpty query param', async () => {
    await controller.findSubfolders('cat-1', user as any, 'true');

    expect(categoryService.findSubfolders).toHaveBeenCalledWith(
      'cat-1',
      'user-1',
      true,
    );
  });

  it('creates a subfolder under a parent category', async () => {
    const dto = { name: 'Subfolder', icon: 'folder-outline', color: '#111111' };

    await controller.createSubfolder('cat-1', dto as any, user as any);

    expect(categoryService.createSubfolder).toHaveBeenCalledWith(
      'cat-1',
      dto,
      'user-1',
    );
  });

  it('gets one category', async () => {
    categoryService.findOne.mockResolvedValue({ id: 'cat-1' });

    await controller.findOne('cat-1', user as any);

    expect(categoryService.findOne).toHaveBeenCalledWith('cat-1', 'user-1');
  });

  it('updates category', async () => {
    const dto = { name: 'Updated' };

    await controller.update('cat-1', dto as any, user as any);

    expect(categoryService.update).toHaveBeenCalledWith('cat-1', dto, 'user-1');
  });

  it('removes category', async () => {
    await controller.remove('cat-1', user as any);

    expect(categoryService.remove).toHaveBeenCalledWith('cat-1', 'user-1');
  });
});
