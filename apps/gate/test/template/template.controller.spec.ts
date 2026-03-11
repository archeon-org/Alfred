import { TemplateController } from 'src/template/template.controller';

describe('TemplateController', () => {
  const templateService = {
    applyTemplate: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findCategories: jest.fn(),
  };
  const controller = new TemplateController(templateService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies a template for current user', async () => {
    await controller.apply('tpl-1', { id: 'user-1' } as any);

    expect(templateService.applyTemplate).toHaveBeenCalledWith(
      'tpl-1',
      'user-1',
    );
  });

  it('creates template', async () => {
    const dto = { name: 'Starter' };
    await controller.create(dto as any);

    expect(templateService.create).toHaveBeenCalledWith(dto);
  });

  it('lists templates', async () => {
    const query = { page: 1 };
    await controller.findAll(query as any);

    expect(templateService.findAll).toHaveBeenCalledWith(query);
  });

  it('gets one template', async () => {
    await controller.findOne('tpl-1');

    expect(templateService.findOne).toHaveBeenCalledWith('tpl-1');
  });

  it('updates template', async () => {
    const dto = { name: 'Updated' };
    await controller.update('tpl-1', dto as any);

    expect(templateService.update).toHaveBeenCalledWith('tpl-1', dto);
  });

  it('deletes template', async () => {
    await controller.remove('tpl-1');

    expect(templateService.remove).toHaveBeenCalledWith('tpl-1');
  });

  it('lists template categories', async () => {
    const query = { page: 1, limit: 5 };
    await controller.findCategories('tpl-1', query as any);

    expect(templateService.findCategories).toHaveBeenCalledWith('tpl-1', query);
  });
});
