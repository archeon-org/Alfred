import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GoogleVerifyDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { User, SubscriptionStatus } from '@archeon-org/types';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { SubscriptionService } from '../subscription/subscription.service';

interface MeResponse extends User {
  subscription: SubscriptionStatus;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Retrieves the authenticated user profile along with subscription status.',
  })
  @ApiOkResponse({
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
            plan: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getProfile(@Req() req: Request & { user: any }): Promise<MeResponse> {
    const user = req.user as User;
    const subscription = await this.subscriptionService.getSubscriptionStatus(
      user.id,
    );

    return {
      ...user,
      subscription,
    };
  }

  @Post('google/verify')
  @Public()
  @ApiOperation({
    summary: 'Verify Google OAuth token',
    description:
      'Verifies a Google access token and creates/returns a user with JWT token.',
  })
  @ApiBody({ type: GoogleVerifyDto })
  @ApiOkResponse({
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
  })
  @ApiUnauthorizedResponse({ description: 'Invalid Google access token' })
  async verifyGoogleToken(@Body() googleVerifyDto: GoogleVerifyDto) {
    return this.authService.verifyGoogleToken(googleVerifyDto);
  }

  @Post('otp/request')
  @Public()
  @ApiOperation({
    summary: 'Request OTP code',
    description:
      'Sends a 6-digit OTP code to the provided email address for authentication.',
  })
  @ApiBody({ type: RequestOtpDto })
  @ApiOkResponse({
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
  })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('otp/verify')
  @Public()
  @ApiOperation({
    summary: 'Verify OTP code',
    description: 'Verifies the OTP code and returns JWT token if valid.',
  })
  @ApiBody({ type: VerifyOtpDto })
  @ApiOkResponse({
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
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired OTP code' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }
}
