import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SubscriptionTier,
  SubscriptionStatus,
  TIER_LIMITS,
  TierLimits,
} from '@archeon-org/types';
import {
  ApiCheckCreditsDocs,
  ApiGetCreditsDocs,
  ApiGetSubscriptionStatusDocs,
  ApiGetTiersDocs,
  ApiSubscriptionControllerDocs,
  ApiUpgradeTierDocs,
} from './subscription.docs';
import {
  CheckCreditsDto,
  UpgradeSubscriptionDto,
} from './dto/subscription.dto';

@ApiSubscriptionControllerDocs()
@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('status')
  @ApiGetSubscriptionStatusDocs()
  async getStatus(
    @CurrentUser('id') userId: string,
  ): Promise<SubscriptionStatus> {
    return this.subscriptionService.getSubscriptionStatus(userId);
  }

  @Get('credits')
  @ApiGetCreditsDocs()
  async getCredits(
    @CurrentUser('id') userId: string,
  ): Promise<{ credits: number }> {
    const credits = await this.subscriptionService.getCredits(userId);
    return { credits };
  }

  @Post('check')
  @ApiCheckCreditsDocs()
  async checkCredits(
    @CurrentUser('id') userId: string,
    @Body() body: CheckCreditsDto,
  ): Promise<{ canAfford: boolean; cost: number; currentCredits: number }> {
    return this.subscriptionService.checkCredits(userId, body.operation);
  }

  @Get('tiers')
  @ApiGetTiersDocs()
  async getTiers(): Promise<Record<SubscriptionTier, TierLimits>> {
    return TIER_LIMITS;
  }

  //Note: In production, this should verify payment before upgrading
  @Post('upgrade')
  @ApiUpgradeTierDocs()
  async upgradeTier(
    @CurrentUser('id') userId: string,
    @Body() body: UpgradeSubscriptionDto,
  ): Promise<SubscriptionStatus> {
    return this.subscriptionService.upgradeTier(userId, body.tier);
  }
}
