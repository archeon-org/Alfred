import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { UserEntity } from '@archeon-org/database';
import { SubscriptionService } from '../subscription/subscription.service';
import { QueueService } from '../queue/queue.service';
import {
  SubscriptionTier,
  CreditPack,
  StoragePack,
  CREDIT_PACKS,
  STORAGE_PACKS,
  TIER_LIMITS,
  UserType,
} from '@archeon-org/types';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly queueService: QueueService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Get paginated list of users with optional search
   */
  async getUsers(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    const whereClause = search
      ? [
          { email: ILike(`%${search}%`) },
          { firstName: ILike(`%${search}%`) },
          { lastName: ILike(`%${search}%`) },
        ]
      : undefined;

    const [users, total] = await this.userRepository.findAndCount({
      where: whereClause,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        credits: user.credits,
        bonusSearches: user.bonusSearches,
        dailySearchUsed: user.dailySearchUsed,
        storageUsed: Number(user.storageUsed),
        storageLimit: Number(user.storageLimit),
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get detailed user information
   */
  async getUserDetails(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const tierLimits = TIER_LIMITS[user.subscriptionTier];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      subscription: {
        tier: user.subscriptionTier,
        tierLimits,
        credits: user.credits,
        bonusSearches: user.bonusSearches,
        dailySearchUsed: user.dailySearchUsed,
        dailySearchLimit: tierLimits.dailySearchLimit,
        storageUsed: Number(user.storageUsed),
        storageLimit: Number(user.storageLimit),
        extraStorage: Number(user.extraStorage),
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Set user's subscription tier
   */
  async setUserTier(userId: string, tier: SubscriptionTier) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    this.logger.log(
      `Admin setting user ${userId} tier from ${user.subscriptionTier} to ${tier}`,
    );

    await this.subscriptionService.updateTier(userId, tier);

    return this.getUserDetails(userId);
  }

  /**
   * Add credit pack to user
   */
  async addCreditPack(userId: string, pack: CreditPack) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const packInfo = CREDIT_PACKS[pack];
    if (!packInfo) {
      throw new NotFoundException(`Credit pack ${pack} not found`);
    }

    this.logger.log(
      `Admin adding credit pack ${pack} to user ${userId}: ${packInfo.credits} credits, ${packInfo.bonusSearches} bonus searches`,
    );

    await this.subscriptionService.addCredits(
      userId,
      packInfo.credits,
      `Admin added credit pack: ${pack}`,
    );
    if (packInfo.bonusSearches > 0) {
      await this.subscriptionService.addBonusSearches(
        userId,
        packInfo.bonusSearches,
        `Admin added credit pack: ${pack}`,
      );
    }

    return this.getUserDetails(userId);
  }

  /**
   * Set custom credits for user (replaces existing value)
   */
  async addCustomCredits(
    userId: string,
    credits: number,
    bonusSearches: number = 0,
    reason: string = 'Admin adjustment',
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    this.logger.log(
      `Admin setting custom credits for user ${userId}: credits=${credits}. Reason: ${reason}`,
    );

    // Always set values (even if 0)
    await this.userRepository.update(userId, { credits, bonusSearches });

    return this.getUserDetails(userId);
  }

  /**
   * Set custom bonus searches for user (replaces existing value)
   */
  async setCustomBonusSearches(
    userId: string,
    bonusSearches: number,
    reason: string = 'Admin adjustment',
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    this.logger.log(
      `Admin setting custom bonus searches for user ${userId}: bonusSearches=${bonusSearches}. Reason: ${reason}`,
    );

    // Always set bonusSearches (even if 0)
    await this.userRepository.update(userId, { bonusSearches });

    return this.getUserDetails(userId);
  }

  /**
   * Set storage for user using a storage pack
   */
  async setStoragePack(userId: string, pack: StoragePack) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const packInfo = STORAGE_PACKS[pack];
    if (!packInfo) {
      throw new NotFoundException(`Storage pack ${pack} not found`);
    }

    const tierLimits = TIER_LIMITS[user.subscriptionTier];
    const targetStorage = packInfo.bytes;

    // Calculate extraStorage needed to achieve target storage
    // extraStorage = targetStorage - tierBaseStorage (can be negative, meaning less than tier base)
    const extraStorage = Math.max(
      0,
      targetStorage - tierLimits.storageLimitBytes,
    );

    this.logger.log(
      `Admin setting storage for user ${userId} to ${packInfo.displaySize} (tier base: ${tierLimits.storageLimitBytes}, extra: ${extraStorage})`,
    );

    await this.userRepository.update(userId, {
      storageLimit: targetStorage,
      extraStorage: extraStorage,
    });

    return this.getUserDetails(userId);
  }

  /**
   * Set custom storage for user (in GB)
   */
  async setCustomStorage(
    userId: string,
    storageGb: number,
    reason: string = 'Admin adjustment',
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const tierLimits = TIER_LIMITS[user.subscriptionTier];
    const targetStorage = storageGb * 1024 * 1024 * 1024;

    // Calculate extraStorage needed to achieve target storage
    const extraStorage = Math.max(
      0,
      targetStorage - tierLimits.storageLimitBytes,
    );

    this.logger.log(
      `Admin setting custom storage for user ${userId} to ${storageGb} GB (tier base: ${tierLimits.storageLimitBytes}, extra: ${extraStorage}). Reason: ${reason}`,
    );

    await this.userRepository.update(userId, {
      storageLimit: targetStorage,
      extraStorage: extraStorage,
    });

    return this.getUserDetails(userId);
  }

  /**
   * Reset daily search usage for a user
   */
  async resetDailySearch(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    this.logger.log(`Admin resetting daily search usage for user ${userId}`);

    await this.userRepository.update(userId, {
      dailySearchUsed: 0,
    });

    return this.getUserDetails(userId);
  }

  /**
   * Get subscription statistics for admin dashboard
   */
  async getSubscriptionStats() {
    const allUsers = await this.userRepository.find();

    const stats = {
      totalUsers: allUsers.length,
      byTier: {} as Record<SubscriptionTier, number>,
      byRole: {} as Record<UserType, number>,
      totalCredits: 0,
      totalBonusSearches: 0,
      totalStorageUsedBytes: 0,
      activeToday: 0,
    };

    for (const user of allUsers) {
      // Count by tier
      stats.byTier[user.subscriptionTier] =
        (stats.byTier[user.subscriptionTier] || 0) + 1;

      // Count by role
      stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;

      // Sum credits
      stats.totalCredits += user.credits;
      stats.totalBonusSearches += user.bonusSearches || 0;
      stats.totalStorageUsedBytes += Number(user.storageUsed) || 0;

      // Count active today (users who have done a search today)
      if (user.dailySearchUsed > 0) {
        stats.activeToday++;
      }
    }

    return stats;
  }

  async triggerRagBackfill(
    requestedBy: string,
    batchSize: number = 100,
  ): Promise<{ queued: boolean; batchSize: number; requestedBy: string }> {
    await this.queueService.addBackfillDocumentsJob({
      requestedBy,
      batchSize,
    });
    return {
      queued: true,
      batchSize,
      requestedBy,
    };
  }
}
