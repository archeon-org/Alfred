import { AuthProvider } from '@archeon-org/types';
import { UserRepository } from 'src/user/user.repository';

describe('UserRepository', () => {
  const queryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  const dataSource = {
    manager: {
      getRepository: jest.fn(() => repo),
    },
  } as any;

  const repository = new UserRepository(dataSource, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.getOne.mockResolvedValue(null);
    repo.update.mockResolvedValue(undefined);
  });

  it('findById queries by id', async () => {
    await repository.findById('user-1');

    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('findByEmail queries by email', async () => {
    await repository.findByEmail('user@example.com');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
  });

  it('createGoogleOAuthUser persists provider as google', async () => {
    repo.create.mockImplementation((data) => data);
    repo.save.mockImplementation(async (data) => data);

    const dto = {
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      googleId: 'google-1',
    } as any;
    const result = await repository.createGoogleOAuthUser(dto);

    expect(repo.create).toHaveBeenCalledWith({
      ...dto,
      provider: AuthProvider.GOOGLE,
    });
    expect(repo.save).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ provider: AuthProvider.GOOGLE }),
    );
  });

  it('updateLastLogin writes a timestamp', async () => {
    await repository.updateLastLogin('user-1');

    expect(repo.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ lastLoginAt: expect.any(Date) }),
    );
  });

  it('findByEmailWithOtp selects otp hash in query builder', async () => {
    await repository.findByEmailWithOtp('user@example.com');

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.otpHash');
    expect(queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'user@example.com',
    });
    expect(queryBuilder.getOne).toHaveBeenCalled();
  });

  it('updateOtp stores hashed otp and expiration', async () => {
    const expiresAt = new Date('2026-03-05T15:00:00.000Z');

    await repository.updateOtp('user-1', 'hashed-otp', expiresAt);

    expect(repo.update).toHaveBeenCalledWith('user-1', {
      otpHash: 'hashed-otp',
      otpExpiresAt: expiresAt,
    });
  });

  it('clearOtp nulls otp fields', async () => {
    await repository.clearOtp('user-1');

    expect(repo.update).toHaveBeenCalledWith('user-1', {
      otpHash: null,
      otpExpiresAt: null,
    });
  });

  it('update writes data then returns refreshed entity', async () => {
    repo.update.mockResolvedValue(undefined);
    const refreshed = { id: 'user-1', name: 'Updated' } as any;
    const findByIdSpy = jest
      .spyOn(repository, 'findById')
      .mockResolvedValue(refreshed);

    const result = await repository.update('user-1', {
      name: 'Updated',
    } as any);

    expect(repo.update).toHaveBeenCalledWith('user-1', { name: 'Updated' });
    expect(findByIdSpy).toHaveBeenCalledWith('user-1');
    expect(result).toBe(refreshed);
  });
});
