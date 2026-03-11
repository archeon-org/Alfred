import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiPublicController } from '../common/decorators/api-controller.decorator';
import { GoogleVerifyDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

export function ApiAuthControllerDocs(): ClassDecorator {
  return ApiPublicController('auth', 'Authentication & Authorization');
}

export function ApiGetProfileDocs(): MethodDecorator {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiOperation({
      summary: 'Get current user profile',
      description:
        'Retrieves the authenticated user profile along with subscription status.',
    }),
    ApiOkResponse({
      description: 'User profile with subscription status',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string', nullable: true },
          lastName: { type: 'string', nullable: true },
          profilePicture: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          subscription: {
            type: 'object',
            properties: {
              isActive: { type: 'boolean' },
              plan: { type: 'string', enum: ['free', 'pro'] },
              expiresAt: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
            },
          },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' }),
  );
}

export function ApiVerifyGoogleDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Verify Google OAuth token',
      description:
        'Verifies a Google access token and creates or returns a user with JWT token.',
    }),
    ApiBody({ type: GoogleVerifyDto }),
    ApiOkResponse({
      description: 'Authentication successful',
      schema: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', description: 'JWT access token' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
            },
          },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Invalid Google access token' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiRequestOtpDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Request OTP code',
      description:
        'Sends a 6-digit OTP code to the provided email address for authentication.',
    }),
    ApiBody({ type: RequestOtpDto }),
    ApiOkResponse({
      description: 'OTP sent successfully',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'OTP sent successfully' },
          expiresIn: {
            type: 'number',
            example: 300,
            description: 'OTP expiration time in seconds',
          },
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}

export function ApiVerifyOtpDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Verify OTP code',
      description: 'Verifies the OTP code and returns JWT token if valid.',
    }),
    ApiBody({ type: VerifyOtpDto }),
    ApiOkResponse({
      description: 'OTP verified successfully',
      schema: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', description: 'JWT access token' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
            },
          },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Invalid or expired OTP code' }),
    ApiBadRequestResponse({ description: 'Invalid request payload' }),
  );
}
