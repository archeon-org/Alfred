import { AdminController } from 'src/admin/admin.controller';

describe('AdminController', () => {
  const adminService = {
    getUsers: jest.fn(),
    getUserDetails: jest.fn(),
    setUserTier: jest.fn(),
    addCreditPack: jest.fn(),
    addCustomCredits: jest.fn(),
    setCustomBonusSearches: jest.fn(),
    setStoragePack: jest.fn(),
    setCustomStorage: jest.fn(),
    resetDailySearch: jest.fn(),
    getSubscriptionStats: jest.fn(),
    triggerRagBackfill: jest.fn(),
  };
  const controller = new AdminController(adminService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists users with defaults', async () => {
    await controller.getUsers();

    expect(adminService.getUsers).toHaveBeenCalledWith(1, 20, undefined);
  });

  it('gets user details', async () => {
    await controller.getUser('user-1');

    expect(adminService.getUserDetails).toHaveBeenCalledWith('user-1');
  });

  it('upgrades user tier', async () => {
    await controller.upgradeTier('user-1', { tier: 'PRO' } as any);

    expect(adminService.setUserTier).toHaveBeenCalledWith('user-1', 'PRO');
  });

  it('adds credit pack', async () => {
    await controller.addCredits('user-1', { pack: 'SMALL' } as any);

    expect(adminService.addCreditPack).toHaveBeenCalledWith('user-1', 'SMALL');
  });

  it('adds custom credits with defaults', async () => {
    await controller.addCustomCredits('user-1', { credits: 99 } as any);

    expect(adminService.addCustomCredits).toHaveBeenCalledWith(
      'user-1',
      99,
      0,
      'Admin adjustment',
    );
  });

  it('sets custom bonus searches with default reason', async () => {
    await controller.setCustomBonusSearches('user-1', {
      bonusSearches: 10,
    } as any);

    expect(adminService.setCustomBonusSearches).toHaveBeenCalledWith(
      'user-1',
      10,
      'Admin adjustment',
    );
  });

  it('sets storage pack', async () => {
    await controller.setStorage('user-1', { pack: 'SMALL' } as any);

    expect(adminService.setStoragePack).toHaveBeenCalledWith('user-1', 'SMALL');
  });

  it('sets custom storage with default reason', async () => {
    await controller.setCustomStorage('user-1', { storageGb: 30 } as any);

    expect(adminService.setCustomStorage).toHaveBeenCalledWith(
      'user-1',
      30,
      'Admin adjustment',
    );
  });

  it('resets daily search count', async () => {
    await controller.resetDailySearch('user-1');

    expect(adminService.resetDailySearch).toHaveBeenCalledWith('user-1');
  });

  it('returns aggregate stats', async () => {
    await controller.getStats();

    expect(adminService.getSubscriptionStats).toHaveBeenCalled();
  });

  it('triggers rag backfill with defaults', async () => {
    await controller.triggerRagBackfill({} as any);

    expect(adminService.triggerRagBackfill).toHaveBeenCalledWith('admin', 100);
  });
});
