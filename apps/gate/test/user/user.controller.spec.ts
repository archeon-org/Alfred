import { UserController } from 'src/user/user.controller';

describe('UserController', () => {
  const userService = {
    findById: jest.fn(),
    update: jest.fn(),
  };
  const controller = new UserController(userService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns current user profile', async () => {
    userService.findById.mockResolvedValue({ id: 'user-1' });

    await controller.getMe({ user: { id: 'user-1' } } as any);

    expect(userService.findById).toHaveBeenCalledWith('user-1');
  });

  it('updates current user profile', async () => {
    const dto = { firstName: 'Updated' };
    userService.update.mockResolvedValue({ id: 'user-1', ...dto });

    await controller.updateMe({ user: { id: 'user-1' } } as any, dto as any);

    expect(userService.update).toHaveBeenCalledWith('user-1', dto);
  });
});
