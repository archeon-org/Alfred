import { TIER_LIMITS } from '@archeon-org/types';
import { SubscriptionController } from 'src/subscription/subscription.controller';

describe('SubscriptionController', () => {
  const subscriptionService = {
    getSubscriptionStatus: jest.fn(),
    getCredits: jest.fn(),
    checkCredits: jest.fn(),
    upgradeTier: jest.fn(),
  };
  const controller = new SubscriptionController(subscriptionService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns subscription status', async () => {
    subscriptionService.getSubscriptionStatus.mockResolvedValue({
      tier: 'FREE',
    });

    await controller.getStatus('user-1');

    expect(subscriptionService.getSubscriptionStatus).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('returns credits in wrapped payload', async () => {
    subscriptionService.getCredits.mockResolvedValue(42);

    await expect(controller.getCredits('user-1')).resolves.toEqual({
      credits: 42,
    });
  });

  it('checks operation credits', async () => {
    subscriptionService.checkCredits.mockResolvedValue({
      canAfford: true,
      cost: 3,
      currentCredits: 10,
    });

    await controller.checkCredits('user-1', {
      operation: 'AI_CLASSIFICATION',
    } as any);

    expect(subscriptionService.checkCredits).toHaveBeenCalledWith(
      'user-1',
      'AI_CLASSIFICATION',
    );
  });

  it('returns tiers constant', async () => {
    await expect(controller.getTiers()).resolves.toBe(TIER_LIMITS);
  });

  it('upgrades tier through service', async () => {
    subscriptionService.upgradeTier.mockResolvedValue({ tier: 'PRO' });

    await controller.upgradeTier('user-1', { tier: 'PRO' } as any);

    expect(subscriptionService.upgradeTier).toHaveBeenCalledWith(
      'user-1',
      'PRO',
    );
  });
});
