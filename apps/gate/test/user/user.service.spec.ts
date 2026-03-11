import { mergePreferences } from '@archeon-org/types';
import { UserService } from 'src/user/user.service';

describe('UserService', () => {
  const userRepository = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    createGoogleOAuthUser: jest.fn(),
    updateLastLogin: jest.fn(),
    updateOtp: jest.fn(),
    findByEmailWithOtp: jest.fn(),
    clearOtp: jest.fn(),
    update: jest.fn(),
  };
  const service = new UserService(userRepository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates basic repository methods', async () => {
    userRepository.findById.mockResolvedValue({ id: 'user-1' });
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1' });
    userRepository.createGoogleOAuthUser.mockResolvedValue({ id: 'user-2' });
    userRepository.updateLastLogin.mockResolvedValue(undefined);
    userRepository.updateOtp.mockResolvedValue(undefined);
    userRepository.findByEmailWithOtp.mockResolvedValue({ id: 'user-1' });
    userRepository.clearOtp.mockResolvedValue(undefined);

    await service.findById('user-1');
    await service.findByEmail('user@example.com');
    await service.createGoogleOAuthUser({ email: 'a@b.com' } as any);
    await service.updateLastLogin('user-1');
    await service.updateOtp('user-1', 'hash', new Date());
    await service.findByEmailWithOtp('user@example.com');
    await service.clearOtp('user-1');

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(userRepository.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(userRepository.createGoogleOAuthUser).toHaveBeenCalled();
    expect(userRepository.updateLastLogin).toHaveBeenCalledWith('user-1');
    expect(userRepository.updateOtp).toHaveBeenCalled();
    expect(userRepository.findByEmailWithOtp).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(userRepository.clearOtp).toHaveBeenCalledWith('user-1');
  });

  it('merges preferences before update when current user exists', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'user-1',
      preferences: {
        display: {
          theme: 'system',
          compactMode: false,
          categoriesViewMode: 'list',
          documentsViewMode: 'list',
        },
      },
    });
    userRepository.update.mockResolvedValue({ id: 'user-1' });

    await service.update('user-1', {
      preferences: { display: { theme: 'dark' } },
    } as any);

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        preferences: mergePreferences(
          {
            display: {
              theme: 'system',
              compactMode: false,
              categoriesViewMode: 'list',
              documentsViewMode: 'list',
            },
          } as any,
          { display: { theme: 'dark' } } as any,
        ),
      }),
    );
  });

  it('updates directly when preferences are absent', async () => {
    userRepository.update.mockResolvedValue({ id: 'user-1' });

    await service.update('user-1', { firstName: 'Updated' } as any);

    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      firstName: 'Updated',
    });
  });
});
