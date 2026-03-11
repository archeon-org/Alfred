import { SubscriptionCronService } from 'src/subscription/subscription.cron';

describe('SubscriptionCronService', () => {
  const resetQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const statsQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };
  const userRepository = {
    createQueryBuilder: jest.fn((alias?: string) =>
      alias ? statsQueryBuilder : resetQueryBuilder,
    ),
  };
  const service = new SubscriptionCronService(userRepository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resets daily counters for all users', async () => {
    resetQueryBuilder.execute.mockResolvedValue({ affected: 12 });

    await service.resetDailySearchCounters();

    expect(userRepository.createQueryBuilder).toHaveBeenCalled();
    expect(resetQueryBuilder.update).toHaveBeenCalled();
    expect(resetQueryBuilder.set).toHaveBeenCalledWith({
      dailySearchUsed: 0,
      dailySearchResetAt: expect.any(Date),
    });
  });

  it('swallows reset errors and logs them', async () => {
    resetQueryBuilder.execute.mockRejectedValue(new Error('db down'));

    await expect(service.resetDailySearchCounters()).resolves.toBeUndefined();
  });

  it('queries and logs daily subscription stats', async () => {
    statsQueryBuilder.getRawMany.mockResolvedValue([
      { tier: 'FREE', count: '10', totalCredits: '50' },
      { tier: 'PRO', count: '2', totalCredits: '120' },
    ]);

    await service.logSubscriptionStats();

    expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(statsQueryBuilder.select).toHaveBeenCalledWith(
      'user.subscriptionTier',
      'tier',
    );
    expect(statsQueryBuilder.getRawMany).toHaveBeenCalled();
  });
});
