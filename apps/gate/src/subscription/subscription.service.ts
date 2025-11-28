import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@archeon-org/database';
import {
  SubscriptionTier,
  SubscriptionStatus,
  CreditOperation,
  CREDIT_COSTS,
  TIER_LIMITS,
  StoragePack,
  STORAGE_PACKS,
  canAffordOperation,
  canUseAiSearch,
} from '@archeon-org/types';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Get the subscription status for a user
   */
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'subscriptionTier',
        'credits',
        'dailySearchUsed',
        'dailySearchResetAt',
        'bonusSearches',
        'storageUsed',
        'storageLimit',
        'extraStorage',
      ],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if daily search needs reset
    await this.checkAndResetDailySearch(user);

    const tierLimits = TIER_LIMITS[user.subscriptionTier];
    const storageUsed = Number(user.storageUsed) || 0;
    const storageLimit =
      Number(user.storageLimit) || tierLimits.storageLimitBytes;
    const extraStorage = Number(user.extraStorage) || 0;

    return {
      tier: user.subscriptionTier,
      credits: user.credits,
      dailySearchUsed: user.dailySearchUsed,
      dailySearchLimit: tierLimits.dailySearchLimit,
      dailySearchResetsAt: this.getNextResetTime(user.dailySearchResetAt),
      bonusSearches: user.bonusSearches,
      canUseAiSearch: canUseAiSearch(
        user.dailySearchUsed,
        user.subscriptionTier,
        user.bonusSearches,
      ),
      canProcessDocuments: user.credits > 0,
      // Storage info
      storageUsed,
      storageLimit: storageLimit,
      extraStoragePurchased: extraStorage,
      storagePercentUsed: Math.round((storageUsed / storageLimit) * 100),
    };
  }

  /**
   * Check if user can afford an operation and throw if not
   */
  async checkCredits(
    userId: string,
    operation: CreditOperation,
  ): Promise<{ canAfford: boolean; cost: number; currentCredits: number }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'credits'],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const cost = CREDIT_COSTS[operation];
    const canAfford = canAffordOperation(user.credits, operation);

    return {
      canAfford,
      cost,
      currentCredits: user.credits,
    };
  }

  /**
   * Consume credits for an operation
   * Returns the new credit balance
   */
  async consumeCredits(
    userId: string,
    operation: CreditOperation,
  ): Promise<number> {
    const cost = CREDIT_COSTS[operation];

    // Use atomic update to prevent race conditions
    const result = await this.userRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        credits: () => `credits - ${cost}`,
      })
      .where('id = :userId', { userId })
      .andWhere('credits >= :cost', { cost })
      .returning(['credits'])
      .execute();

    if (result.affected === 0) {
      // Either user not found or insufficient credits
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'credits'],
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      throw new BadRequestException(
        `Insufficient credits. Required: ${cost}, Available: ${user.credits}`,
      );
    }

    const newCredits = result.raw[0]?.credits ?? 0;

    this.logger.log(
      `User ${userId} consumed ${cost} credits for ${operation}. New balance: ${newCredits}`,
    );

    return newCredits;
  }

  /**
   * Add credits to a user (for purchases or admin adjustments)
   */
  async addCredits(
    userId: string,
    amount: number,
    reason: string,
  ): Promise<number> {
    const result = await this.userRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        credits: () => `credits + ${amount}`,
      })
      .where('id = :userId', { userId })
      .returning(['credits'])
      .execute();

    if (result.affected === 0) {
      throw new BadRequestException('User not found');
    }

    const newCredits = result.raw[0]?.credits ?? 0;

    this.logger.log(
      `User ${userId} received ${amount} credits (${reason}). New balance: ${newCredits}`,
    );

    return newCredits;
  }

  /**
   * Add bonus AI searches to a user (for credit pack purchases)
   * These searches don't reset daily
   */
  async addBonusSearches(
    userId: string,
    amount: number,
    reason: string,
  ): Promise<number> {
    const result = await this.userRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        bonusSearches: () => `"bonusSearches" + ${amount}`,
      })
      .where('id = :userId', { userId })
      .returning(['"bonusSearches"'])
      .execute();

    if (result.affected === 0) {
      throw new BadRequestException('User not found');
    }

    const newBonusSearches = Number(result.raw[0]?.bonusSearches) || 0;

    this.logger.log(
      `User ${userId} received ${amount} bonus AI searches (${reason}). New balance: ${newBonusSearches}`,
    );

    return newBonusSearches;
  }

  /**
   * Check if user can use AI search and increment counter
   * Uses daily searches first, then bonus searches
   */
  async useAiSearch(userId: string): Promise<{
    allowed: boolean;
    remainingSearches: number;
    bonusSearches: number;
    resetsAt: Date;
    usedBonus: boolean;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'subscriptionTier',
        'dailySearchUsed',
        'dailySearchResetAt',
        'bonusSearches',
      ],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check and reset if needed
    await this.checkAndResetDailySearch(user);

    // Reload user after potential reset
    const freshUser = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'subscriptionTier',
        'dailySearchUsed',
        'dailySearchResetAt',
        'bonusSearches',
      ],
    });

    if (!freshUser) {
      throw new BadRequestException('User not found');
    }

    const tierLimits = TIER_LIMITS[freshUser.subscriptionTier];
    const dailyRemaining = Math.max(
      0,
      tierLimits.dailySearchLimit - freshUser.dailySearchUsed,
    );

    // Check if user can search (daily or bonus)
    if (dailyRemaining === 0 && freshUser.bonusSearches === 0) {
      return {
        allowed: false,
        remainingSearches: 0,
        bonusSearches: 0,
        resetsAt: this.getNextResetTime(freshUser.dailySearchResetAt),
        usedBonus: false,
      };
    }

    // Use daily searches first, then bonus
    if (dailyRemaining > 0) {
      // Use daily search
      await this.userRepository.update(userId, {
        dailySearchUsed: freshUser.dailySearchUsed + 1,
      });

      return {
        allowed: true,
        remainingSearches: dailyRemaining - 1,
        bonusSearches: freshUser.bonusSearches,
        resetsAt: this.getNextResetTime(freshUser.dailySearchResetAt),
        usedBonus: false,
      };
    } else {
      // Use bonus search
      await this.userRepository.update(userId, {
        bonusSearches: freshUser.bonusSearches - 1,
      });

      return {
        allowed: true,
        remainingSearches: 0,
        bonusSearches: freshUser.bonusSearches - 1,
        resetsAt: this.getNextResetTime(freshUser.dailySearchResetAt),
        usedBonus: true,
      };
    }
  }

  /**
   * Check if daily search counter needs reset and reset if necessary
   */
  private async checkAndResetDailySearch(user: UserEntity): Promise<void> {
    const now = new Date();
    const resetAt = new Date(user.dailySearchResetAt);

    // Check if we need to reset (more than 24 hours have passed)
    if (now.getTime() - resetAt.getTime() >= 24 * 60 * 60 * 1000) {
      await this.userRepository.update(user.id, {
        dailySearchUsed: 0,
        dailySearchResetAt: now,
      });

      this.logger.debug(`Reset daily search counter for user ${user.id}`);
    }
  }

  /**
   * Calculate the next reset time (24 hours from last reset)
   */
  private getNextResetTime(lastResetAt: Date): Date {
    const nextReset = new Date(lastResetAt);
    nextReset.setTime(nextReset.getTime() + 24 * 60 * 60 * 1000);
    return nextReset;
  }

  /**
   * Upgrade user's subscription tier
   * Applies new tier benefits: credits, storage limit
   */
  async upgradeTier(
    userId: string,
    newTier: SubscriptionTier,
  ): Promise<SubscriptionStatus> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'subscriptionTier',
        'credits',
        'storageLimit',
        'extraStorage',
      ],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const currentTier = user.subscriptionTier;
    const currentTierLimits = TIER_LIMITS[currentTier];
    const newTierLimits = TIER_LIMITS[newTier];

    // Prevent downgrade through this method
    if (newTierLimits.priceEurMonth < currentTierLimits.priceEurMonth) {
      throw new BadRequestException(
        'Cannot downgrade tier through this method. Contact support.',
      );
    }

    // Calculate new storage limit (base + extra purchased)
    const extraStorage = Number(user.extraStorage) || 0;
    const newStorageLimit = newTierLimits.storageLimitBytes + extraStorage;

    // Add the initial credits for the new tier
    const bonusCredits = newTierLimits.initialCredits;

    await this.userRepository.update(userId, {
      subscriptionTier: newTier,
      storageLimit: newStorageLimit,
      credits: user.credits + bonusCredits,
    });

    this.logger.log(
      `User ${userId} upgraded from ${currentTier} to ${newTier}. ` +
        `Added ${bonusCredits} credits. New storage limit: ${Math.round(newStorageLimit / (1024 * 1024 * 1024))} GB`,
    );

    return this.getSubscriptionStatus(userId);
  }

  /**
   * Update user's subscription tier (admin function - no restrictions)
   * Also adds the initial credits for the new tier
   */
  async updateTier(
    userId: string,
    tier: SubscriptionTier,
  ): Promise<SubscriptionStatus> {
    const tierLimits = TIER_LIMITS[tier];

    // Get user's current data
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'extraStorage', 'credits', 'subscriptionTier'],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const extraStorage = Number(user.extraStorage) || 0;
    const newStorageLimit = tierLimits.storageLimitBytes + extraStorage;

    // Set credits to the tier's initial credits (not added, just set)
    const newCredits = tierLimits.initialCredits;

    await this.userRepository.update(userId, {
      subscriptionTier: tier,
      storageLimit: newStorageLimit,
      credits: newCredits,
    });

    this.logger.log(
      `User ${userId} tier updated to ${tier} (admin). Credits set to ${newCredits}`,
    );

    return this.getSubscriptionStatus(userId);
  }

  /**
   * Get credit balance for a user
   */
  async getCredits(userId: string): Promise<number> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['credits'],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user.credits;
  }

  /**
   * Add extra storage to a user (for purchases or admin adjustments)
   * Returns the new total storage limit
   */
  async addExtraStorage(
    userId: string,
    pack: StoragePack,
    reason: string,
  ): Promise<{ extraStorage: number; totalStorageLimit: number }> {
    const packInfo = STORAGE_PACKS[pack];

    const result = await this.userRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        extraStorage: () => `"extraStorage" + ${packInfo.bytes}`,
        storageLimit: () => `"storageLimit" + ${packInfo.bytes}`,
      })
      .where('id = :userId', { userId })
      .returning(['"extraStorage"', '"storageLimit"'])
      .execute();

    if (result.affected === 0) {
      throw new BadRequestException('User not found');
    }

    const newExtraStorage = Number(result.raw[0]?.extraStorage) || 0;
    const newStorageLimit = Number(result.raw[0]?.storageLimit) || 0;

    this.logger.log(
      `User ${userId} purchased ${packInfo.displaySize} extra storage (${reason}). ` +
        `New total: ${Math.round(newStorageLimit / (1024 * 1024 * 1024))} GB`,
    );

    return {
      extraStorage: newExtraStorage,
      totalStorageLimit: newStorageLimit,
    };
  }

  /**
   * Check if user has enough storage for a file
   */
  async checkStorage(
    userId: string,
    fileSizeBytes: number,
  ): Promise<{
    hasSpace: boolean;
    storageUsed: number;
    storageLimit: number;
    spaceNeeded: number;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['storageUsed', 'storageLimit'],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const storageUsed = Number(user.storageUsed) || 0;
    const storageLimit = Number(user.storageLimit) || 0;
    const spaceAvailable = storageLimit - storageUsed;
    const hasSpace = spaceAvailable >= fileSizeBytes;

    return {
      hasSpace,
      storageUsed,
      storageLimit,
      spaceNeeded: hasSpace ? 0 : fileSizeBytes - spaceAvailable,
    };
  }
}
