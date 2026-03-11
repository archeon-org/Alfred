import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';
import {
  CheckCreditsDto,
  UpgradeSubscriptionDto,
} from './dto/subscription.dto';

export function ApiSubscriptionControllerDocs(): ClassDecorator {
  return ApiPrivateController('subscription', 'Subscription & Billing');
}

export function ApiGetSubscriptionStatusDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get subscription status',
      description:
        'Retrieves the current subscription status including tier, limits, and usage.',
    }),
    ApiOkResponse({
      description: 'Subscription status',
      schema: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['free', 'pro'] },
          isActive: { type: 'boolean' },
          credits: { type: 'number' },
          dailySearchLimit: { type: 'number' },
          dailySearchesUsed: { type: 'number' },
          documentLimit: { type: 'number' },
          documentsUsed: { type: 'number' },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
    }),
  );
}

export function ApiGetCreditsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get credit balance',
      description: 'Retrieves the current credit balance for AI operations.',
    }),
    ApiOkResponse({
      description: 'Credit balance',
      schema: {
        type: 'object',
        properties: {
          credits: { type: 'number' },
        },
      },
    }),
  );
}

export function ApiCheckCreditsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Check credit availability',
      description:
        'Checks if user has enough credits for a specific operation.',
    }),
    ApiBody({ type: CheckCreditsDto }),
    ApiOkResponse({
      description: 'Credit check result',
      schema: {
        type: 'object',
        properties: {
          canAfford: { type: 'boolean' },
          cost: { type: 'number' },
          currentCredits: { type: 'number' },
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiGetTiersDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get subscription tiers',
      description:
        'Returns available subscription tiers with their features and limits.',
    }),
    ApiOkResponse({
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
    }),
  );
}

export function ApiUpgradeTierDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Upgrade subscription',
      description:
        'Upgrades user subscription to a new tier. In production, payment verification should happen before this call.',
    }),
    ApiBody({ type: UpgradeSubscriptionDto }),
    ApiOkResponse({ description: 'Updated subscription status' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}
