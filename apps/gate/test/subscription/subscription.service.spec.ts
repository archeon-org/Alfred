import { BadRequestException } from '@nestjs/common';
import {
  CREDIT_COSTS,
  CreditOperation,
  STORAGE_PACKS,
  SubscriptionTier,
  TIER_LIMITS,
} from '@archeon-org/types';
import { SubscriptionService } from 'src/subscription/subscription.service';

describe('SubscriptionService', () => {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const service = new SubscriptionService(userRepository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when user is missing in subscription status', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getSubscriptionStatus('user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns subscription status with computed storage fields', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
      credits: 20,
      dailySearchUsed: 1,
      dailySearchResetAt: new Date(),
      bonusSearches: 2,
      storageUsed: 512,
      storageLimit: 1024,
      extraStorage: 256,
    });

    const result = await service.getSubscriptionStatus('user-1');

    expect(result.tier).toBe(SubscriptionTier.FREE);
    expect(result.credits).toBe(20);
    expect(result.storageUsed).toBe(512);
    expect(result.storageLimit).toBe(1024);
    expect(result.storagePercentUsed).toBe(50);
  });

  it('resets daily searches when reset window elapsed', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
      credits: 5,
      dailySearchUsed: 8,
      dailySearchResetAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      bonusSearches: 0,
      storageUsed: 0,
      storageLimit: 1024,
      extraStorage: 0,
    });
    userRepository.update.mockResolvedValue(undefined);

    await service.getSubscriptionStatus('user-1');

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        dailySearchUsed: 0,
        dailySearchResetAt: expect.any(Date),
      }),
    );
  });

  it('checks credit affordability', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      credits: 1,
    });

    const result = await service.checkCredits(
      'user-1',
      CreditOperation.AI_CLASSIFICATION,
    );

    expect(result).toEqual({
      canAfford: false,
      cost: CREDIT_COSTS[CreditOperation.AI_CLASSIFICATION],
      currentCredits: 1,
    });
  });

  it('consumes credits atomically', async () => {
    queryBuilder.execute.mockResolvedValue({
      affected: 1,
      raw: [{ credits: 7 }],
    });

    await expect(
      service.consumeCredits('user-1', CreditOperation.AI_CLASSIFICATION),
    ).resolves.toBe(7);
  });

  it('throws when credit consumption cannot be satisfied', async () => {
    queryBuilder.execute.mockResolvedValue({ affected: 0, raw: [] });
    userRepository.findOne.mockResolvedValue({ id: 'user-1', credits: 0 });

    await expect(
      service.consumeCredits('user-1', CreditOperation.AI_CLASSIFICATION),
    ).rejects.toThrow('Insufficient credits');
  });

  it('uses getCredits path when consume amount is zero', async () => {
    const getCreditsSpy = jest
      .spyOn(service, 'getCredits')
      .mockResolvedValue(33);

    await expect(
      service.consumeCreditsAmount('user-1', 0, 'No-op'),
    ).resolves.toBe(33);
    expect(getCreditsSpy).toHaveBeenCalledWith('user-1');
  });

  it('denies AI search when both daily and bonus are exhausted', async () => {
    const tierLimit = TIER_LIMITS[SubscriptionTier.FREE].dailySearchLimit;
    const user = {
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
      dailySearchUsed: tierLimit,
      dailySearchResetAt: new Date(),
      bonusSearches: 0,
    };
    userRepository.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(user);

    await expect(service.useAiSearch('user-1')).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        remainingSearches: 0,
        bonusSearches: 0,
      }),
    );
  });

  it('uses daily search allowance first', async () => {
    const user = {
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
      dailySearchUsed: 0,
      dailySearchResetAt: new Date(),
      bonusSearches: 2,
    };
    userRepository.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(user);

    const result = await service.useAiSearch('user-1');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      dailySearchUsed: 1,
    });
    expect(result.allowed).toBe(true);
    expect(result.usedBonus).toBe(false);
  });

  it('falls back to bonus searches when daily allowance is exhausted', async () => {
    const tierLimit = TIER_LIMITS[SubscriptionTier.FREE].dailySearchLimit;
    const user = {
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
      dailySearchUsed: tierLimit,
      dailySearchResetAt: new Date(),
      bonusSearches: 2,
    };
    userRepository.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(user);

    const result = await service.useAiSearch('user-1');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      bonusSearches: 1,
    });
    expect(result.allowed).toBe(true);
    expect(result.usedBonus).toBe(true);
    expect(result.bonusSearches).toBe(1);
  });

  it('prevents downgrade in upgradeTier', async () => {
    const tiers = Object.entries(TIER_LIMITS).sort(
      (a, b) => a[1].priceEurMonth - b[1].priceEurMonth,
    );
    const lowTier = tiers[0][0] as SubscriptionTier;
    const highTier = tiers[tiers.length - 1][0] as SubscriptionTier;

    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: highTier,
      credits: 1,
      storageLimit: 0,
      extraStorage: 0,
    });

    await expect(service.upgradeTier('user-1', lowTier)).rejects.toThrow(
      'Cannot downgrade tier',
    );
  });

  it('updates tier with admin override', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      extraStorage: 1024,
      credits: 4,
      subscriptionTier: SubscriptionTier.FREE,
    });
    userRepository.update.mockResolvedValue(undefined);
    jest
      .spyOn(service, 'getSubscriptionStatus')
      .mockResolvedValue({ tier: SubscriptionTier.PRO } as any);

    await expect(
      service.updateTier('user-1', SubscriptionTier.PRO),
    ).resolves.toEqual({
      tier: SubscriptionTier.PRO,
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        subscriptionTier: SubscriptionTier.PRO,
        credits: TIER_LIMITS[SubscriptionTier.PRO].initialCredits,
      }),
    );
  });

  it('returns credits value', async () => {
    userRepository.findOne.mockResolvedValue({ credits: 12 });

    await expect(service.getCredits('user-1')).resolves.toBe(12);
  });

  it('adds extra storage from pack', async () => {
    const packName = Object.keys(STORAGE_PACKS)[0] as any;
    queryBuilder.execute.mockResolvedValue({
      affected: 1,
      raw: [{ extraStorage: 2048, storageLimit: 4096 }],
    });

    await expect(
      service.addExtraStorage('user-1', packName, 'purchase'),
    ).resolves.toEqual({
      extraStorage: 2048,
      totalStorageLimit: 4096,
    });
  });

  it('checks storage availability', async () => {
    userRepository.findOne.mockResolvedValue({
      storageUsed: 900,
      storageLimit: 1000,
    });

    await expect(service.checkStorage('user-1', 200)).resolves.toEqual({
      hasSpace: false,
      storageUsed: 900,
      storageLimit: 1000,
      spaceNeeded: 100,
    });
  });
});
