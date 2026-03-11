import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiAdminController } from '../common/decorators/api-controller.decorator';
import {
  AddCreditsPackDto,
  AddCustomCreditsDto,
  SetBonusSearchesDto,
  SetCustomStorageDto,
  SetStoragePackDto,
  TriggerRagBackfillDto,
  UpgradeTierDto,
} from './dto/admin.dto';

const userIdParam = {
  name: 'userId',
  description: 'User UUID',
  type: 'string',
  format: 'uuid',
};

const userDetailsSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    role: { type: 'string' },
    subscription: { type: 'object' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

export function ApiAdminControllerDocs(): ClassDecorator {
  return ApiAdminController();
}

export function ApiAdminListUsersDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'List users',
      description: 'Returns paginated users with optional search filters.',
    }),
    ApiQuery({
      name: 'page',
      required: false,
      type: 'number',
      description: 'Page number',
      example: 1,
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: 'number',
      description: 'Page size',
      example: 20,
    }),
    ApiQuery({
      name: 'search',
      required: false,
      type: 'string',
      description: 'Search by email, first name or last name',
    }),
    ApiOkResponse({
      description: 'Paginated users',
      schema: {
        type: 'object',
        properties: {
          users: { type: 'array', items: { type: 'object' } },
          pagination: { type: 'object' },
        },
      },
    }),
  );
}

export function ApiAdminGetUserDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get user details',
      description: 'Returns detailed data for a specific user.',
    }),
    ApiParam(userIdParam),
    ApiOkResponse({
      description: 'User details',
      schema: userDetailsSchema,
    }),
    ApiNotFoundResponse({ description: 'User not found' }),
  );
}

export function ApiAdminUpgradeTierDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Set user tier',
      description: 'Changes user subscription tier.',
    }),
    ApiParam(userIdParam),
    ApiBody({ type: UpgradeTierDto }),
    ApiOkResponse({ description: 'User updated', schema: userDetailsSchema }),
    ApiNotFoundResponse({ description: 'User not found' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiAdminAddCreditsPackDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Add credit pack',
      description: 'Adds a predefined credit pack to the user.',
    }),
    ApiParam(userIdParam),
    ApiBody({ type: AddCreditsPackDto }),
    ApiOkResponse({ description: 'User updated', schema: userDetailsSchema }),
    ApiNotFoundResponse({ description: 'User or credit pack not found' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiAdminAddCustomCreditsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Set custom credits',
      description:
        'Sets custom credits and optional bonus searches for a user (admin adjustment).',
    }),
    ApiParam(userIdParam),
    ApiBody({ type: AddCustomCreditsDto }),
    ApiOkResponse({ description: 'User updated', schema: userDetailsSchema }),
    ApiNotFoundResponse({ description: 'User not found' }),
  );
}

export function ApiAdminSetBonusSearchesDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Set bonus searches',
      description: 'Sets the bonus search counter for a user.',
    }),
    ApiParam(userIdParam),
    ApiBody({ type: SetBonusSearchesDto }),
    ApiOkResponse({ description: 'User updated', schema: userDetailsSchema }),
    ApiNotFoundResponse({ description: 'User not found' }),
  );
}

export function ApiAdminSetStoragePackDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Set storage pack',
      description: 'Sets user storage using a predefined storage pack.',
    }),
    ApiParam(userIdParam),
    ApiBody({ type: SetStoragePackDto }),
    ApiOkResponse({ description: 'User updated', schema: userDetailsSchema }),
    ApiNotFoundResponse({ description: 'User or storage pack not found' }),
  );
}

export function ApiAdminSetCustomStorageDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Set custom storage',
      description: 'Sets custom storage limit in GB for a user.',
    }),
    ApiParam(userIdParam),
    ApiBody({ type: SetCustomStorageDto }),
    ApiOkResponse({ description: 'User updated', schema: userDetailsSchema }),
    ApiNotFoundResponse({ description: 'User not found' }),
  );
}

export function ApiAdminResetDailySearchDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Reset daily search usage',
      description: 'Resets daily search counter for a user.',
    }),
    ApiParam(userIdParam),
    ApiOkResponse({ description: 'User updated', schema: userDetailsSchema }),
    ApiNotFoundResponse({ description: 'User not found' }),
  );
}

export function ApiAdminStatsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get subscription stats',
      description:
        'Returns aggregated subscription, credits and storage metrics for admin dashboards.',
    }),
    ApiOkResponse({
      description: 'Admin stats',
      schema: {
        type: 'object',
        properties: {
          totalUsers: { type: 'number' },
          byTier: { type: 'object' },
          byRole: { type: 'object' },
          totalCredits: { type: 'number' },
          totalBonusSearches: { type: 'number' },
          totalStorageUsedBytes: { type: 'number' },
          activeToday: { type: 'number' },
        },
      },
    }),
  );
}

export function ApiAdminBackfillDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Trigger RAG backfill',
      description:
        'Queues a background job to backfill missing document embeddings for retrieval.',
    }),
    ApiBody({ type: TriggerRagBackfillDto }),
    ApiOkResponse({
      description: 'Backfill job queued',
      schema: {
        type: 'object',
        properties: {
          queued: { type: 'boolean', example: true },
          batchSize: { type: 'number' },
          requestedBy: { type: 'string' },
        },
      },
    }),
  );
}
