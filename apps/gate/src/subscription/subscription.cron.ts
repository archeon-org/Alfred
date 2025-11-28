import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@archeon-org/database';

@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Reset daily search counters for all users at midnight UTC
   * Runs every day at 00:00 UTC
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailySearchCounters(): Promise<void> {
    this.logger.log('Starting daily search counter reset...');

    try {
      const result = await this.userRepository
        .createQueryBuilder()
        .update(UserEntity)
        .set({
          dailySearchUsed: 0,
          dailySearchResetAt: new Date(),
        })
        .execute();

      this.logger.log(
        `Daily search counters reset for ${result.affected} users`,
      );
    } catch (error) {
      this.logger.error('Failed to reset daily search counters', error);
    }
  }

  // NOTE: Monthly credits for Pro users will be handled via Stripe webhooks
  // When invoice.payment_succeeded is received, credits are added.
  // This ensures credits are only given when payment is successful.

  /**
   * Log subscription statistics daily at 01:00 UTC
   * Useful for monitoring and analytics
   */
  @Cron('0 1 * * *') // At 01:00 every day
  async logSubscriptionStats(): Promise<void> {
    try {
      // Count users by tier
      const stats = await this.userRepository
        .createQueryBuilder('user')
        .select('user.subscriptionTier', 'tier')
        .addSelect('COUNT(*)', 'count')
        .addSelect('SUM(user.credits)', 'totalCredits')
        .groupBy('user.subscriptionTier')
        .getRawMany();

      this.logger.log('Daily subscription statistics:');
      for (const stat of stats) {
        this.logger.log(
          `  ${stat.tier}: ${stat.count} users, ${stat.totalCredits || 0} total credits`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to log subscription stats', error);
    }
  }
}
