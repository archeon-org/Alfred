import { JwtStrategy } from 'src/auth/strategy/jwt.strategy';

describe('JwtStrategy', () => {
  const findOne = jest.fn();
  const getRepository = jest.fn(() => ({ findOne }));
  const dataSource = {
    manager: {
      getRepository,
    },
  };
  const configService = {
    get: jest.fn(() => 'secret'),
  };

  const strategy = new JwtStrategy(dataSource as any, configService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user for valid payload', async () => {
    findOne.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });

    await expect(strategy.validate({ sub: 'user-1' })).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
    expect(findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('returns null when user is missing', async () => {
    findOne.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'missing' })).resolves.toBeNull();
  });
});
