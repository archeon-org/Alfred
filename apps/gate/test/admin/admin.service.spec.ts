import { NotFoundException } from '@nestjs/common';
import {
  CREDIT_PACKS,
  STORAGE_PACKS,
  SubscriptionTier,
  TIER_LIMITS,
  UserType,
} from '@archeon-org/types';
import { AdminService } from 'src/admin/admin.service';

describe('AdminService', () => {
  const subscriptionService = {
    updateTier: jest.fn(),
    addCredits: jest.fn(),
    addBonusSearches: jest.fn(),
  };
  const queueService = {
    addBackfillDocumentsJob: jest.fn(),
  };
  const userRepository = {
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };

  const service = new AdminService(
    subscriptionService as any,
    queueService as any,
    userRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated users with mapped fields', async () => {
    userRepository.findAndCount.mockResolvedValue([
      [
        {
          id: 'user-1',
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: UserType.USER,
          subscriptionTier: SubscriptionTier.FREE,
          credits: 20,
          bonusSearches: 1,
          dailySearchUsed: 0,
          storageUsed: '1024',
          storageLimit: '2048',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          lastLoginAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ],
      1,
    ]);

    await expect(service.getUsers(2, 10, 'john')).resolves.toEqual({
      users: [
        expect.objectContaining({
          id: 'user-1',
          storageUsed: 1024,
          storageLimit: 2048,
        }),
      ],
      pagination: {
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('throws for unknown user in getUserDetails', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(service.getUserDetails('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns detailed user payload', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      role: UserType.USER,
      subscriptionTier: SubscriptionTier.FREE,
      credits: 20,
      bonusSearches: 1,
      dailySearchUsed: 0,
      storageUsed: '1024',
      storageLimit: '2048',
      extraStorage: '128',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    });

    const result = await service.getUserDetails('user-1');

    expect(result.subscription.tierLimits).toEqual(
      TIER_LIMITS[SubscriptionTier.FREE],
    );
    expect(result.subscription.storageUsed).toBe(1024);
  });

  it('sets user tier and returns refreshed details', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
    });
    subscriptionService.updateTier.mockResolvedValue({});
    const detailsSpy = jest
      .spyOn(service, 'getUserDetails')
      .mockResolvedValue({ id: 'user-1' } as any);

    await expect(
      service.setUserTier('user-1', SubscriptionTier.PRO),
    ).resolves.toEqual({ id: 'user-1' });
    expect(subscriptionService.updateTier).toHaveBeenCalledWith(
      'user-1',
      SubscriptionTier.PRO,
    );
    expect(detailsSpy).toHaveBeenCalledWith('user-1');
  });

  it('throws when credit pack is unknown', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
    });

    await expect(
      service.addCreditPack('user-1', 'UNKNOWN' as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds credit pack and bonus searches when applicable', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
    });
    const packWithBonus = Object.entries(CREDIT_PACKS).find(
      ([, value]) => value.bonusSearches > 0,
    )?.[0] as any;
    const detailsSpy = jest
      .spyOn(service, 'getUserDetails')
      .mockResolvedValue({ id: 'user-1' } as any);

    await service.addCreditPack('user-1', packWithBonus);

    expect(subscriptionService.addCredits).toHaveBeenCalled();
    expect(subscriptionService.addBonusSearches).toHaveBeenCalled();
    expect(detailsSpy).toHaveBeenCalledWith('user-1');
  });

  it('sets custom credits', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    userRepository.update.mockResolvedValue(undefined);
    jest
      .spyOn(service, 'getUserDetails')
      .mockResolvedValue({ id: 'user-1' } as any);

    await service.addCustomCredits('user-1', 77);

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      bonusSearches: 0,
      credits: 77,
    });
  });

  it('sets custom bonus searches', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    userRepository.update.mockResolvedValue(undefined);
    jest
      .spyOn(service, 'getUserDetails')
      .mockResolvedValue({ id: 'user-1' } as any);

    await service.setCustomBonusSearches('user-1', 9);

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      bonusSearches: 9,
    });
  });

  it('sets storage pack for user', async () => {
    const pack = Object.keys(STORAGE_PACKS)[0] as any;
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
    });
    userRepository.update.mockResolvedValue(undefined);
    jest
      .spyOn(service, 'getUserDetails')
      .mockResolvedValue({ id: 'user-1' } as any);

    await service.setStoragePack('user-1', pack);

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        storageLimit: STORAGE_PACKS[pack].bytes,
        extraStorage: expect.any(Number),
      }),
    );
  });

  it('sets custom storage from GB value', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      subscriptionTier: SubscriptionTier.FREE,
    });
    userRepository.update.mockResolvedValue(undefined);
    jest
      .spyOn(service, 'getUserDetails')
      .mockResolvedValue({ id: 'user-1' } as any);

    await service.setCustomStorage('user-1', 5);

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        storageLimit: 5 * 1024 * 1024 * 1024,
      }),
    );
  });

  it('resets daily search usage', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-1' });
    userRepository.update.mockResolvedValue(undefined);
    jest
      .spyOn(service, 'getUserDetails')
      .mockResolvedValue({ id: 'user-1' } as any);

    await service.resetDailySearch('user-1');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      dailySearchUsed: 0,
    });
  });

  it('aggregates subscription stats across users', async () => {
    userRepository.find.mockResolvedValue([
      {
        subscriptionTier: SubscriptionTier.FREE,
        role: UserType.USER,
        credits: 10,
        bonusSearches: 1,
        storageUsed: '100',
        dailySearchUsed: 1,
      },
      {
        subscriptionTier: SubscriptionTier.PRO,
        role: UserType.ADMIN,
        credits: 20,
        bonusSearches: 0,
        storageUsed: '50',
        dailySearchUsed: 0,
      },
    ]);

    await expect(service.getSubscriptionStats()).resolves.toEqual({
      totalUsers: 2,
      byTier: {
        [SubscriptionTier.FREE]: 1,
        [SubscriptionTier.PRO]: 1,
      },
      byRole: {
        [UserType.USER]: 1,
        [UserType.ADMIN]: 1,
      },
      totalCredits: 30,
      totalBonusSearches: 1,
      totalStorageUsedBytes: 150,
      activeToday: 1,
    });
  });

  it('enqueues rag backfill job', async () => {
    queueService.addBackfillDocumentsJob.mockResolvedValue(undefined);

    await expect(service.triggerRagBackfill('admin', 75)).resolves.toEqual({
      queued: true,
      batchSize: 75,
      requestedBy: 'admin',
    });
    expect(queueService.addBackfillDocumentsJob).toHaveBeenCalledWith({
      requestedBy: 'admin',
      batchSize: 75,
    });
  });
});
