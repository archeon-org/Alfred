import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SubscriptionStatus,
  CreditOperation,
  SubscriptionTier,
  TIER_LIMITS,
  TierLimits,
} from '@archeon-org/types';

@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Get current subscription status
   */
  @Get('status')
  async getStatus(
    @CurrentUser('id') userId: string,
  ): Promise<SubscriptionStatus> {
    return this.subscriptionService.getSubscriptionStatus(userId);
  }

  /**
   * Get current credit balance
   */
  @Get('credits')
  async getCredits(
    @CurrentUser('id') userId: string,
  ): Promise<{ credits: number }> {
    const credits = await this.subscriptionService.getCredits(userId);
    return { credits };
  }

  /**
   * Check if user can afford an operation
   */
  @Post('check')
  async checkCredits(
    @CurrentUser('id') userId: string,
    @Body('operation') operation: CreditOperation,
  ): Promise<{ canAfford: boolean; cost: number; currentCredits: number }> {
    return this.subscriptionService.checkCredits(userId, operation);
  }

  /**
   * Get available subscription tiers and their features
   */
  @Get('tiers')
  async getTiers(): Promise<Record<SubscriptionTier, TierLimits>> {
    return TIER_LIMITS;
  }

  /**
   * Upgrade subscription tier
   * Note: In production, this should verify payment before upgrading
   */
  @Post('upgrade')
  async upgradeTier(
    @CurrentUser('id') userId: string,
    @Body('tier') tier: SubscriptionTier,
  ): Promise<SubscriptionStatus> {
    return this.subscriptionService.upgradeTier(userId, tier);
  }
}
