import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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

@ApiTags('subscription')
@ApiBearerAuth('JWT-auth')
@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get subscription status',
    description:
      'Retrieves the current subscription status including tier, limits, and usage.',
  })
  @ApiOkResponse({
    description: 'Subscription status',
    schema: {
      type: 'object',
      properties: {
        tier: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
        isActive: { type: 'boolean' },
        credits: { type: 'number' },
        dailySearchLimit: { type: 'number' },
        dailySearchesUsed: { type: 'number' },
        documentLimit: { type: 'number' },
        documentsUsed: { type: 'number' },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getStatus(
    @CurrentUser('id') userId: string,
  ): Promise<SubscriptionStatus> {
    return this.subscriptionService.getSubscriptionStatus(userId);
  }

  @Get('credits')
  @ApiOperation({
    summary: 'Get credit balance',
    description: 'Retrieves the current credit balance for AI operations.',
  })
  @ApiOkResponse({
    description: 'Credit balance',
    schema: {
      type: 'object',
      properties: {
        credits: { type: 'number' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getCredits(
    @CurrentUser('id') userId: string,
  ): Promise<{ credits: number }> {
    const credits = await this.subscriptionService.getCredits(userId);
    return { credits };
  }

  @Post('check')
  @ApiOperation({
    summary: 'Check credit availability',
    description: 'Checks if user has enough credits for a specific operation.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['operation'],
      properties: {
        operation: {
          type: 'string',
          enum: ['document_upload', 'ai_search', 'graph_ingestion'],
          description: 'Type of operation to check',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Credit check result',
    schema: {
      type: 'object',
      properties: {
        canAfford: { type: 'boolean' },
        cost: { type: 'number' },
        currentCredits: { type: 'number' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async checkCredits(
    @CurrentUser('id') userId: string,
    @Body('operation') operation: CreditOperation,
  ): Promise<{ canAfford: boolean; cost: number; currentCredits: number }> {
    return this.subscriptionService.checkCredits(userId, operation);
  }

  @Get('tiers')
  @ApiOperation({
    summary: 'Get subscription tiers',
    description:
      'Returns available subscription tiers with their features and limits.',
  })
  @ApiOkResponse({
    description: 'Available subscription tiers',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          monthlyCredits: { type: 'number' },
          dailySearchLimit: { type: 'number' },
          documentLimit: { type: 'number' },
          features: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  })
  async getTiers(): Promise<Record<SubscriptionTier, TierLimits>> {
    return TIER_LIMITS;
  }

  //Note: In production, this should verify payment before upgrading
  @Post('upgrade')
  @ApiOperation({
    summary: 'Upgrade subscription',
    description:
      'Upgrades user subscription to a new tier. Note: Production should verify payment.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tier'],
      properties: {
        tier: {
          type: 'string',
          enum: ['free', 'pro', 'enterprise'],
          description: 'Target subscription tier',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Updated subscription status' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async upgradeTier(
    @CurrentUser('id') userId: string,
    @Body('tier') tier: SubscriptionTier,
  ): Promise<SubscriptionStatus> {
    return this.subscriptionService.upgradeTier(userId, tier);
  }
}
